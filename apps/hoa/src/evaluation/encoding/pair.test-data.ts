import { exampleRulesFile } from "@/schema/exampleRulebook.test-data"
import type { Rule, Term } from "@/schema/types"
import { rule, term } from "@/schema/zod"
import type { AgentPairs } from "./pairs"
import type { RunDraft, RunInfo } from "./run"
import { scoreRun } from "./score"

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

export const inSplit = (key: string) => key.startsWith("guidelines:5.5")

/** The coding agent's pairing of the example run: the renamed metal height rule. */
export const examplePairs: AgentPairs = {
  rules: [{ reference: "guidelines:5.5.2#metal-height", pipeline: "guidelines:5.5.2#metal-limit" }],
  terms: []
}

/**
 * A run over the examples' section 5.5: the pipeline found every provision, kept one height rule as it was, gave the
 * metal height rule another key and another modality, and missed the rest. Two units, one repaired.
 */
export function exampleRun(pairs: AgentPairs = examplePairs) {
  const provisions = golden.provisions.filter((provision) => inSplit(provision.key))
  const metal = goldenRule("guidelines:5.5.2#metal-height")
  const pipelineRules = [
    goldenRule("guidelines:5.5.1(i)#max-height"),
    {
      ...(metal.kind === "norm" ? { ...metal, modality: "prohibition" as const } : metal),
      key: "guidelines:5.5.2#metal-limit"
    }
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
  return { draft, scores: scoreRun({ golden, draft, report, inSplit, pairs }) }
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
