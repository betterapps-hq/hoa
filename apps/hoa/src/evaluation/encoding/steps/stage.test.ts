import invariant from "tiny-invariant"
import { describe, expect, it } from "vitest"
import { citableProvisions, definingProvisions } from "@/encoding/steps/definedTerms"
import { kindName, type Outline } from "@/encoding/steps/outline"
import { findingKeys } from "@/encoding/steps/ruleFinding"
import { structureOf } from "@/encoding/steps/ruleStructuring"
import type { StepAi } from "@/encoding/steps/run"
import { keySegment } from "@/encoding/steps/termKeys"
import { coreTerms } from "@/schema/coreTerms"
import { termDraft, type TermContent } from "@/schema/zod"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { promptText, replyingModel, variableOf, variablesPromptLoader } from "@/tests/scriptedModel"
import { buildDatasets, type DefinedTermsItem } from "./datasets"
import { goldenReferences, goldenTerms } from "./golden"
import {
  scoreConsolidation,
  scoreDefinedTerms,
  scoreFinding,
  scoreMerge,
  scoreStructuring,
  scoreVocabulary,
  termAlignment,
  type ItemScore
} from "./scores"
import {
  runConsolidation,
  runDefinedTerms,
  runRuleFinding,
  runRuleStructuring,
  runSharedVocabulary,
  runVocabularyMerge
} from "./stage"

// Every drafted step run over its golden dataset with a mock model that answers what the golden says, in the step's
// answer format: the step's code (keys composed, labels resolved, checks, merges) must turn those answers back into the
// expected outputs, so the scores call them correct. No paid model is called.

const golden = sampleRulesFile()
const references = goldenReferences(
  golden,
  golden.documents.map((document) => ({ key: document.key, names: [document.title] }))
)
const datasets = buildDatasets({ golden, references, splitOf: () => "dev" })
const terms = goldenTerms(golden)
const coreKeys = new Set(coreTerms.map((term) => term.key))

/** A mock AI answering each call, in order, with the next answer (or what it makes of the prompt's text). */
function answering(answers: readonly (unknown | ((text: string) => unknown))[]): StepAi {
  let next = 0
  return {
    loadPrompt: variablesPromptLoader,
    createModel: () =>
      replyingModel((options) => {
        const answer = answers[next]
        next += 1
        const toolInput = typeof answer === "function" ? answer(promptText(options)) : answer
        return {
          toolInput,
          usage: { input: 1000, output: 100 },
          providerMetadata: { openrouter: { usage: { cost: 0.01 } } }
        }
      }),
    modelId: "mock",
    environment: "test",
    sessionId: "test",
    promptVersions: {}
  }
}

/** Each step runs over its whole golden dataset (the Declaration and the Guidelines), engine checks included. */
const slow = 60_000

const context = (answers: readonly unknown[]) => ({ ai: answering(answers), cacheStage: "test", reruns: 0 })

const labelsOf = (term: TermContent) => {
  const preferred = term.labels.find((label) => label.role === "preferred") ?? term.labels[0]
  return {
    preferred: { text: preferred?.text ?? term.key, plural: preferred?.plural ?? null },
    alternatives: term.labels
      .filter((label) => label !== preferred && label.role !== "avoid")
      .map((label) => label.text)
  }
}
/** A term's citations a step may give: those among `citable`, else `fallback`. */
const citationKeys = (term: TermContent, fallback: string, citable?: ReadonlySet<string>) => {
  const keys = term.citations
    .map((citation) => citation.provisionKey)
    .filter((key) => citable === undefined || citable.has(key))
  return keys.length > 0 ? keys : [fallback]
}
const byKey = new Map<string, TermContent>([...coreTerms, ...terms].map((term) => [term.key, term]))
const preferredOf = (term: TermContent) => labelsOf(term).preferred.text
/**
 * A golden term as a model names it in criteria, following the prompt's rule: a core key as given, else its preferred
 * label lowercased and hyphenated, under its thing's or set's reference. The step's code must resolve it.
 */
function referenceOf(key: string): string {
  const term = byKey.get(key)
  if (!term || coreKeys.has(key)) {
    return key
  }
  const own = keySegment(preferredOf(term))
  if (term.kind === "property") {
    return `${referenceOf(term.of)}.${own}`
  }
  return term.kind === "value" ? `${referenceOf(term.set)}.${own}` : own
}
/** A condition, value type or derivation with every golden term key in it written as the model's reference. */
const asReferences = <V>(value: V): V =>
  JSON.parse(
    JSON.stringify(value, (_field, item: unknown) =>
      typeof item === "string" && byKey.has(item) ? referenceOf(item) : item
    )
  )
const property = (term: Extract<TermContent, { kind: "property" }>) => ({
  of: referenceOf(term.of),
  ...labelsOf(term),
  valueType: asReferences(term.valueType),
  many: term.many,
  ifUnstated: term.ifUnstated,
  definition: term.definition
})
const valuesOf = (set: string, expected: readonly TermContent[]) =>
  expected.flatMap((term) =>
    term.kind === "value" && term.set === set
      ? [{ ...labelsOf(term), broader: term.broader.map((key) => preferredOf(byKey.get(key) ?? term)) }]
      : []
  )

function definedTermsAnswer(item: DefinedTermsItem) {
  const expected = item.expected.terms
  const citable = new Set(citableProvisions(item.input.definitions, item.input.candidates))
  const fallback = definingProvisions(item.input.definitions, item.input.candidates)[0] ?? ""
  const own = (term: TermContent) => !coreKeys.has(term.key)
  const givenCitations = (term: TermContent) =>
    term.citations.map((citation) => citation.provisionKey).filter((key) => citable.has(key))
  return {
    things: expected.flatMap((term) =>
      term.kind === "thing" && own(term)
        ? [
            {
              nature: term.nature,
              ...labelsOf(term),
              definition: term.definition,
              citations: citationKeys(term, fallback, citable)
            }
          ]
        : []
    ),
    categories: expected.flatMap((term) =>
      term.kind === "category"
        ? [
            {
              of: referenceOf(term.of),
              ...labelsOf(term),
              definition: term.definition,
              criteria: asReferences(term.criteria),
              citations: citationKeys(term, fallback, citable)
            }
          ]
        : []
    ),
    criteriaTerms: {
      properties: expected.flatMap((term) =>
        term.kind === "property" && own(term) ? [{ ...property(term), citations: givenCitations(term) }] : []
      ),
      valueSets: expected.flatMap((term) => {
        const values =
          term.kind === "value-set"
            ? expected.flatMap((value) =>
                value.kind === "value" && value.set === term.key
                  ? [{ ...labelsOf(value), citations: givenCitations(value) }]
                  : []
              )
            : []
        return term.kind === "value-set" && values.length > 0
          ? [{ ...labelsOf(term), complete: term.complete, values }]
          : []
      }),
      units: expected.flatMap((term) =>
        term.kind === "unit" && own(term)
          ? [{ ...labelsOf(term), dimension: term.dimension, perBase: term.perBase }]
          : []
      )
    },
    refinements: expected.flatMap((term) =>
      coreKeys.has(term.key)
        ? [
            {
              key: term.key,
              ...labelsOf(term),
              definition: term.definition,
              citations: citationKeys(term, fallback, citable)
            }
          ]
        : []
    ),
    notes: []
  }
}

const keys = findingKeys(golden.proposedCore)
const preferredLabel = (key: string) =>
  terms.find((term) => term.key === key)?.labels.find((label) => label.role === "preferred")?.text ?? key
/** A key the format's enums hold, or the term's label, as E gives a subject it has no key for. */
const named = (key: string | null, known: readonly string[]) =>
  key !== null && known.includes(key) ? key : { label: preferredLabel(key ?? "lot") }

function targetsOf(outline: Outline) {
  return {
    rules: outline.resolved?.rules ?? [],
    provisions: outline.selector?.provisions.length ? outline.selector.provisions : [outline.provisionKey],
    documents: [...(outline.resolved?.documents ?? []), ...(outline.selector?.documents ?? [])]
  }
}

function draftOutline(outline: Outline) {
  const common = {
    aspect: outline.key.slice(outline.key.indexOf("#") + 1),
    summary: outline.summary || outline.key,
    domain: outline.domain,
    citations: outline.citations,
    reads: outline.reads,
    interpretation: false
  }
  const party = (key: string | null) => named(key ?? "owner", keys.parties)
  const subject = (key: string | null) => named(key, keys.subjects)
  const kind = kindName(outline)
  switch (kind) {
    case "obligation":
    case "recommendation":
    case "prohibition":
      return {
        ...common,
        kind,
        bearer: party(outline.bearer),
        appliesTo: subject(outline.appliesTo),
        requestTypes: outline.requestTypes
      }
    case "obligation-judged":
    case "recommendation-judged":
      return {
        ...common,
        kind,
        bearer: party(outline.bearer),
        decidedBy: party(outline.decidedBy),
        appliesTo: subject(outline.appliesTo),
        requestTypes: outline.requestTypes
      }
    case "requirement":
      return { ...common, kind, appliesTo: subject(outline.appliesTo), requestTypes: outline.requestTypes }
    case "permission":
      return {
        ...common,
        kind,
        bearer: party(outline.bearer),
        appliesTo: outline.appliesTo === null ? null : subject(outline.appliesTo),
        requestTypes: outline.requestTypes,
        overrides: targetsOf(outline)
      }
    case "discretion":
      return {
        ...common,
        kind,
        decidedBy: party(outline.decidedBy),
        appliesTo: outline.appliesTo === null ? null : subject(outline.appliesTo),
        requestTypes: outline.requestTypes,
        overrides: targetsOf(outline)
      }
    case "sanction":
      return {
        ...common,
        kind,
        modality: outline.modality,
        requestType: outline.requestTypes[0],
        sanctionType: outline.sanction?.type,
        imposedBy: party(outline.sanction?.imposedBy ?? null),
        against: (outline.sanction?.against ?? []).map(party),
        enforces: targetsOf(outline)
      }
    default:
      return {
        ...common,
        kind: "limit",
        appliesTo: subject(outline.appliesTo),
        requestTypes: outline.requestTypes,
        limits: targetsOf(outline)
      }
  }
}

/** E's no-rule reason for a provision, in its answer format. */
function noRuleOf(key: string, reason: string | null) {
  switch (reason) {
    case null:
      return null
    case "duplicate":
      return { reason, of: key }
    case "explanatory":
      return { reason, note: "no requirement" }
    default:
      return { reason }
  }
}

const verdicts = (scores: readonly ItemScore[]) => {
  const counts: Record<string, number> = {}
  for (const score of scores) {
    counts[score.verdict] = (counts[score.verdict] ?? 0) + 1
  }
  return counts
}
const notes = (scores: readonly ItemScore[]) =>
  scores.filter((score) => score.verdict !== "correct").flatMap((score) => score.notes)

describe("drafted steps on their golden datasets, answered as the golden says", () => {
  it(
    "B returns the defined terms, which pass its check",
    async () => {
      const items = datasets["defined-terms"]
      const answers = items.map(definedTermsAnswer)
      const run = await runDefinedTerms(items, context(answers))
      const scores = items.map((item) => scoreDefinedTerms(item, run.outputs.get(item.id) ?? null))
      expect(notes(scores)).toEqual([])
      expect(run.problems).toEqual([])
      expect(run.calls).toHaveLength(items.length)
    },
    slow
  )

  it("B matches things and categories by labels and citations, not keys, and counts judged golden gaps", () => {
    const item = datasets["defined-terms"].find((found) =>
      found.expected.terms.some((term) => term.kind === "category")
    )
    expect(item).toBeDefined()
    if (!item) {
      return
    }
    const defining = definingProvisions(item.input.definitions, item.input.candidates)[0] ?? ""
    const renamed = item.expected.terms.map((term) =>
      term.kind === "thing" && !coreKeys.has(term.key) ? { ...term, key: `${term.key}-x` } : term
    )
    const extra = termDraft.parse({
      key: "garden-plot",
      kind: "thing",
      nature: "object",
      labels: [{ text: "Garden Plot", role: "preferred" }],
      citations: [{ provisionKey: defining, highlight: null, region: null }]
    })
    const output = { terms: [...renamed, extra] }
    const unjudged = scoreDefinedTerms(item, output)
    expect(unjudged.metrics).toMatchObject({ "thing-recall": 1, "extra-things": 1, "golden-gaps": 0 })
    expect(unjudged.notes.some((note) => note.startsWith('golden-gap candidate: thing "Garden Plot"'))).toBe(true)
    const judged = scoreDefinedTerms(item, output, ["garden plots"])
    expect(judged.metrics).toMatchObject({ "extra-things": 0, "golden-gaps": 1 })
  })

  it("B isn't asked to find a thing the golden adds only for a category to be of, which cites no provision", () => {
    const item = datasets["defined-terms"].find((found) => found.expected.terms.some((term) => term.kind === "thing"))
    expect(item).toBeDefined()
    if (!item) {
      return
    }
    const helper = termDraft.parse({
      key: "thing-outside",
      kind: "thing",
      nature: "object",
      labels: [{ text: "thing outside a building", role: "preferred" }],
      citations: []
    })
    const withHelper = { ...item, expected: { terms: [...item.expected.terms, helper] } }
    const score = scoreDefinedTerms(withHelper, { terms: item.expected.terms })
    expect(score.metrics["thing-recall"]).toBe(1)
  })

  it(
    "E outlines every section's rules",
    async () => {
      const items = datasets["rule-finding"]
      const answers = items.map((item) => ({
        provisions: item.expected.provisions.map((entry) => ({
          key: entry.key,
          outlines: entry.outlines.map(draftOutline),
          settings: [],
          noRule: entry.outlines.length > 0 ? null : noRuleOf(entry.key, entry.noRule)
        })),
        questions: [],
        referencedDocuments: [],
        notes: []
      }))
      const definedTerms = datasets["shared-vocabulary"][0]?.input.definedTerms ?? []
      const run = await runRuleFinding(items, { ...context(answers), definedTerms, provisions: golden.provisions })
      const scores = items.map((item) =>
        scoreFinding(item, run.outputs.get(item.id) ?? null, termAlignment(terms, terms), terms)
      )
      expect(notes(scores)).toEqual([])
      expect(run.handoff.outlines?.length).toBe(golden.rules.length)
    },
    slow
  )

  it("E counts a rule split finer than the golden's as found, not as extras", () => {
    const item = datasets["rule-finding"].find((entry) =>
      entry.expected.provisions.some((provision) => provision.outlines.length === 1)
    )
    invariant(item, "a section with a one-rule provision")
    const provisions = item.expected.provisions.map((provision) => {
      const [rule] = provision.outlines
      if (provision.outlines.length !== 1 || !rule) {
        return provision
      }
      const words = rule.summary.split(" ")
      const half = Math.ceil(words.length / 2)
      return {
        ...provision,
        outlines: [
          { ...rule, key: `${rule.key}-first`, summary: words.slice(0, half).join(" ") },
          { ...rule, key: `${rule.key}-second`, summary: words.slice(half).join(" ") }
        ]
      }
    })
    const score = scoreFinding(item, { provisions }, termAlignment(terms, terms), terms)
    expect(score.metrics["rule-recall"]).toBe(1)
    expect(score.metrics["rule-precision"]).toBe(1)
  })

  it(
    "C serves every outline's reads",
    async () => {
      const items = datasets["shared-vocabulary"]
      const answers = items.map((item) => {
        const expected = item.expected.terms
        const serves = (key: string) => item.expected.serves[key] ?? [item.input.outlines[0]?.key ?? ""]
        const given = new Set(item.input.definedTerms.map((term) => term.key))
        return {
          reused: Object.keys(item.expected.serves)
            .filter((key) => given.has(key))
            .map((key) => ({ key, alternatives: [], servesOutlines: serves(key) })),
          things: expected.flatMap((term) =>
            term.kind === "thing"
              ? [
                  {
                    nature: term.nature === "request" ? "object" : term.nature,
                    ...labelsOf(term),
                    definition: term.definition,
                    servesOutlines: serves(term.key)
                  }
                ]
              : []
          ),
          categories: expected.flatMap((term) =>
            term.kind === "category"
              ? [
                  {
                    of: referenceOf(term.of),
                    ...labelsOf(term),
                    definition: term.definition,
                    criteria: asReferences(term.criteria),
                    servesOutlines: serves(term.key)
                  }
                ]
              : []
          ),
          properties: expected.flatMap((term) =>
            term.kind === "property"
              ? [{ ...property(term), derived: asReferences(term.derived), servesOutlines: serves(term.key) }]
              : []
          ),
          valueSets: expected.flatMap((set) => {
            const values = set.kind === "value-set" ? valuesOf(set.key, expected) : []
            return set.kind === "value-set" && values.length > 0
              ? [{ ...labelsOf(set), complete: set.complete, values, servesOutlines: serves(set.key) }]
              : []
          }),
          addValues: [],
          units: expected.flatMap((term) =>
            term.kind === "unit"
              ? [
                  {
                    ...labelsOf(term),
                    dimension: term.dimension,
                    perBase: term.perBase,
                    servesOutlines: serves(term.key)
                  }
                ]
              : []
          ),
          notes: []
        }
      })
      const run = await runSharedVocabulary(items, context(answers))
      const scores = items.map((item) => scoreVocabulary(item, run.outputs.get(item.id) ?? null))
      expect(scores.every((score) => (score.metrics["property-recall"] ?? 1) === 1)).toBe(true)
      expect(run.handoff.entries?.length).toBeGreaterThan(0)
    },
    slow
  )

  it(
    "C-merge folds the planted duplicates back, renames the collisions and keeps lookalikes apart",
    async () => {
      const items = datasets["vocabulary-merge"]
      const answers = items.map((item) => (text: string) => {
        const ids = new Map(
          variableOf(text, "clusters")
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [id = "", key = "", , , , , , origin = ""] = line.split(" | ")
              return [`${key} ${origin}`, id] as const
            })
        )
        const idOf = (key: string, origin: string) => ids.get(`${key} ${origin}`) ?? ""
        return {
          merges: item.expected.merges.map((merge) => ({
            keep: idOf(merge.keep, "group 1"),
            merge: merge.merge.map((key) => idOf(key, "group 2")),
            why: "the same fact"
          })),
          renames: item.expected.renames.map((rename) => ({
            id: idOf(rename.key, rename.origin),
            label: `${rename.key.slice(rename.key.lastIndexOf(".") + 1)} flag`,
            why: "another value type"
          })),
          distinct: [],
          notes: []
        }
      })
      const run = await runVocabularyMerge(items, context(answers))
      const scores = items.map((item) => scoreMerge(item, run.outputs.get(item.id) ?? null))
      expect(notes(scores)).toEqual([])
      expect(run.problems).toEqual([])
      expect(verdicts(scores)).toEqual({ correct: items.length })
    },
    slow
  )

  it(
    "F structures every batch as the golden does",
    async () => {
      const items = datasets["rule-structuring"]
      const answers = items.map((item) => ({
        rules: item.expected.rules.map((rule) => {
          const outline = item.input.outlines.find((found) => found.key === rule.key)
          return structureOf(rule, outline ? kindName(outline) : rule.kind)
        }),
        clauses: {},
        proposedTerms: [],
        outlineIssues: [],
        unfixable: [],
        notes: []
      }))
      const run = await runRuleStructuring(items, {
        ...context(answers),
        provisions: golden.provisions,
        documents: golden.documents,
        retries: 0
      })
      const sides = {
        terms: [...golden.terms, ...golden.proposedCore],
        documents: golden.documents,
        settings: golden.settings
      }
      const scores = items.map((item) =>
        scoreStructuring(item, run.outputs.get(item.id) ?? null, sides, termAlignment(terms, terms))
      )
      const metrics = scores.map((score) => score.metrics)
      // F's format has no judgment check for a requirement: a batch holding one of the golden's such rules can't be
      // answered as the golden is (a SCHEMA GAP of the format); every other batch comes back whole and valid.
      const gap = new Set(
        golden.rules
          .filter((rule) => rule.kind === "norm" && rule.modality === "requirement" && rule.check?.type === "judgment")
          .map((rule) => rule.key)
      )
      const blocked = items.filter((item) => item.expected.rules.some((rule) => gap.has(rule.key)))
      expect(blocked.flatMap((item) => item.expected.rules.filter((rule) => gap.has(rule.key)))).toHaveLength(gap.size)
      for (const item of items.filter((found) => !blocked.includes(found))) {
        const metric = scores[items.indexOf(item)]?.metrics ?? {}
        expect([item.id, metric.structured, metric["valid-before-repair"]]).toEqual([item.id, 1, 1])
      }
      expect(metrics.length).toBe(items.length)
      expect(
        scores.filter((score) => (score.metrics["check-agreement"] ?? 1) < 1).flatMap((score) => score.notes)
      ).toEqual([])
    },
    slow
  )

  it(
    "consolidation restores the cross-section overrides",
    async () => {
      const items = datasets.consolidation
      const answers = items.map((item) => {
        const byRule = new Map<string, string[]>()
        for (const pair of item.expected.overrides) {
          byRule.set(pair.rule, [...(byRule.get(pair.rule) ?? []), pair.target])
        }
        return {
          duplicates: [],
          overrides: [...byRule].map(([rule, overrides]) => ({ rule, overrides, why: "an exception" })),
          conflicts: []
        }
      })
      const run = await runConsolidation(items, context(answers))
      const scores = items.map((item) => scoreConsolidation(item, run.outputs.get(item.id) ?? null))
      expect(notes(scores)).toEqual([])
    },
    slow
  )
})
