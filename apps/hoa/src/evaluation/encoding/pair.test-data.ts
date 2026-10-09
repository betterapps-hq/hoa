import { exampleRulesFile } from "@/schema/exampleRulebook.test-data"
import type { Rule, Term } from "@/schema/types"
import { rule, term } from "@/schema/zod"
import { type EncodingJudgeAnswer, judgeGroups } from "./judge"
import type { RunDraft, RunInfo } from "./run"
import { scoreRun, splitRules } from "./score"

// The schema's examples as the golden side of the evaluation tests, and a pipeline side keyed differently: what a
// second encoder of the same text might return.

export const golden = exampleRulesFile()

export const goldenRule = (key: string) => {
  const found = golden.rules.find((candidate) => candidate.key === key)
  if (!found) {
    throw new Error(`No example rule ${key}`)
  }
  return found
}

/** Every string that is a renamed key, or a dotted key under one, renamed. */
function renameKeys(value: unknown, renames: Readonly<Record<string, string>>): unknown {
  if (typeof value === "string") {
    const [head = "", ...rest] = value.split(".")
    const renamed = renames[value] ?? renames[head]
    return renamed === undefined ? value : (renames[value] ?? [renamed, ...rest].join("."))
  }
  if (Array.isArray(value)) {
    return value.map((item) => renameKeys(item, renames))
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameKeys(item, renames)]))
  }
  return value
}

const inSplit = (key: string) => key.startsWith("guidelines:5.5")

/**
 * A run over the examples' section 5.5: the pipeline found every provision, kept one height rule as it was, gave the
 * metal height rule another modality and missed the rest; the judge said so. Two units, one repaired.
 */
export function exampleRun() {
  const provisions = golden.provisions.filter((provision) => inSplit(provision.key))
  const metal = goldenRule("guidelines:5.5.2#metal-height")
  const pipelineRules = [
    goldenRule("guidelines:5.5.1(i)#max-height"),
    metal.kind === "norm" ? { ...metal, modality: "prohibition" as const } : metal
  ]
  const draft: RunDraft = {
    documents: [
      {
        documentId: "guidelines",
        documents: golden.documents
          .filter((document) => document.key === "guidelines")
          .map((document) => ({ document, provisions }))
      }
    ],
    referenced: [],
    settings: golden.settings,
    coverage: { provisions: provisions.length, uncovered: [] },
    rules: pipelineRules,
    terms: golden.terms,
    questions: []
  }
  const groups = judgeGroups(splitRules(golden, inSplit), pipelineRules)
  const answers: Record<string, EncodingJudgeAnswer> = {
    "guidelines:5.5.1(i)": {
      pairs: [
        { reference: "guidelines:5.5.1(i)#max-height", pipeline: "guidelines:5.5.1(i)#max-height", note: "" },
        { reference: "guidelines:5.5.1(i)#max-height-all", pipeline: null, note: "the other reading" }
      ],
      pipelineRules: [{ key: "guidelines:5.5.1(i)#max-height", faithful: true, reason: "" }],
      comparison: { verdict: "equal", reason: "" }
    },
    "guidelines:5.5.1(ii)": {
      pairs: [{ reference: "guidelines:5.5.1(ii)#fence-and-lattice", pipeline: null, note: "not encoded" }],
      pipelineRules: [],
      comparison: { verdict: "worse", reason: "the lattice limit is missing" }
    },
    "guidelines:5.5.2": {
      pairs: [
        { reference: "guidelines:5.5.2#metal-height", pipeline: "guidelines:5.5.2#metal-height", note: "" },
        { reference: "guidelines:5.5.2#variations", pipeline: null, note: "not encoded" }
      ],
      pipelineRules: [{ key: "guidelines:5.5.2#metal-height", faithful: false, reason: "a limit, not a ban" }],
      comparison: { verdict: "equal", reason: "" }
    }
  }
  const judged = groups.map((group) => {
    const answer = answers[group.provisionKey]
    if (!answer) {
      throw new Error(`No answer for ${group.provisionKey}`)
    }
    return { group, answer }
  })
  const unit = { provisions: 2, isValid: true, problems: 0 }
  const report: RunInfo["report"] = {
    units: [
      { ...unit, id: "guidelines:5.5.1", repairRounds: 0 },
      { ...unit, id: "guidelines:5.5.2", repairRounds: 1 }
    ],
    validAfterEncode: 1,
    problemsBefore: 3,
    calls: []
  }
  return scoreRun({ golden, draft, report, inSplit, judged, termPairs: [] })
}

export const renamedTerms = (renames: Readonly<Record<string, string>>): Term[] =>
  term.array().parse(renameKeys(golden.terms, renames))

/** The golden terms with a fence run's manufacturer renamed and relabeled, so no key or label matches it. */
export const relabeledManufacturer = (): Term[] =>
  renamedTerms({ "fence-run.manufacturer": "fence-run.brand" }).map((item) =>
    item.key === "fence-run.brand"
      ? { ...item, labels: item.labels.map((label) => ({ ...label, text: "trade name of the maker" })) }
      : item
  )

export const renamedRule = (source: Rule, renames: Readonly<Record<string, string>>): Rule =>
  rule.parse(renameKeys(source, renames))
