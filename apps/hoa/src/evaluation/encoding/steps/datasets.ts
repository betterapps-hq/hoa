import { candidateTermPairs } from "@/encoding/consolidate"
import type { TermCandidate } from "@/encoding/definedTerms"
import type { EncodingUnit } from "@/encoding/plan"
import { crossReferenceLines, exceptionLines } from "@/encoding/steps/consolidation"
import { definingProvisions } from "@/encoding/steps/definedTerms"
import { keysIn } from "@/encoding/steps/drafts"
import type { Outline } from "@/encoding/steps/outline"
import { definedTermsInput } from "@/encoding/steps/pipeline"
import { relatedOutlines, structuringBatches } from "@/encoding/steps/ruleStructuring"
import { vocabularyGroups } from "@/encoding/steps/vocabulary"
import type { TermOrigin, VocabularyEntry } from "@/encoding/steps/vocabularyMerge"
import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { RuleContent, TermContent } from "@/schema/zod"
import {
  definedNamesOf,
  expectedDefinedTerms,
  expectedVocabulary,
  goldenDocuments,
  goldenOutlines,
  goldenSections,
  goldenTerms,
  interpretationReadings,
  outlinesAsFound,
  ruleContent,
  termContent,
  sectionOf
} from "./golden"

// The per-step datasets (evaluation.md, Datasets): for each step of the reordered pipeline, items whose input is what
// the step receives, built by code from the golden encoding, and whose expected output is the golden's. Every item has
// a stable id and slice tags (document, split, topic areas, features present). The generator script writes them under
// .fixtures/eval/datasets/<step>/ (git-ignored: they quote the documents), so they regenerate when the golden changes.

export type Tags = { document: string; split: string; topics: string[]; features: string[] }

export type DatasetItem<Input, Expected> = { id: string; step: string; tags: Tags; input: Input; expected: Expected }

type DocumentLine = Pick<T.GoverningDocument, "key" | "kind" | "title" | "edition">

export type DefinedTermsItem = DatasetItem<
  { document: DocumentLine; definitions: T.Provision[]; candidates: TermCandidate[] },
  { terms: TermContent[] }
>
export type RuleFindingItem = DatasetItem<
  { unit: EncodingUnit; documents: DocumentLine[]; definitions: T.Provision[]; knownTerms: TermContent[] },
  {
    provisions: {
      key: T.ProvisionKey
      noRule: T.NoRule["reason"] | null
      outlines: Outline[]
      /** Covered without this section's rules: by a term, a settings clause or a rule of another section citing it. */
      coveredOutside: boolean
    }[]
    /** The section's interpretation questions: each option's rule keys, one reading of an ambiguous passage. */
    readings: T.RuleKey[][][]
  }
>
export type SharedVocabularyItem = DatasetItem<
  {
    groupId: string
    outlines: Outline[]
    provisions: T.Provision[]
    definedTerms: TermContent[]
    previous: TermContent[]
    documents: DocumentLine[]
  },
  { terms: TermContent[]; serves: Record<string, string[]> }
>
export type VocabularyMergeItem = DatasetItem<
  { entries: VocabularyEntry[] },
  {
    /** Planted duplicates, by key: each merges into the kept key. */
    merges: { keep: string; merge: string[] }[]
    /** Planted collisions: the entry (key and origin) that must be renamed. */
    renames: { key: string; origin: TermOrigin }[]
    /** Lookalikes that must stay apart. */
    distinct: string[]
  }
>
export type RuleStructuringItem = DatasetItem<
  {
    batchId: string
    outlines: Outline[]
    related: Outline[]
    vocabulary: TermContent[]
    documents: DocumentLine[]
    provisions: T.Provision[]
    settingsFlags: { provisionKey: T.ProvisionKey; clause: string; summary: string }[]
  },
  { rules: RuleContent[] }
>
export type ConsolidationItem = DatasetItem<
  {
    rules: RuleContent[]
    terms: TermContent[]
    documents: DocumentLine[]
    precedence: T.DocumentKind[][]
    crossReferences: string[]
    /** `exceptionLines`: exceptions that override nothing yet, with the norms they may be about. */
    exceptions: string[]
    /** Rules that are one reading of an ambiguous passage (an interpretation question's options). */
    readings: T.RuleKey[]
  },
  { overrides: { rule: T.RuleKey; target: T.RuleKey }[]; duplicates: string[][]; conflicts: string[][] }
>

/** The split of provisions in none of the evaluation's splits (front matter). */
export const noSplit = "other"

export type GoldenContext = {
  golden: T.RulesFile
  references: ReadonlyMap<T.ProvisionKey, readonly T.ProvisionKey[]>
  /** The split a provision belongs to (dev, test, or `noSplit`), from the evaluation's split selectors. */
  splitOf: (key: T.ProvisionKey) => string
}

const documentOf = (key: string) => key.slice(0, Math.max(0, key.indexOf(":")))
const mainCitation = (rule: Pick<RuleContent, "citations">) => rule.citations[0]?.provisionKey ?? ""
const sorted = (values: Iterable<string>) => [...new Set(values)].toSorted(compareCodeUnits)

/** The features a set of rules and provisions shows, for slicing. */
export function featuresOf(input: {
  rules: readonly RuleContent[]
  provisions: readonly T.Provision[]
  crossReference: boolean
}) {
  const features = new Set<string>()
  for (const rule of input.rules) {
    if (rule.kind === "norm") {
      if (rule.check) {
        features.add(rule.check.type)
      }
      if (rule.modality === "requirement" || rule.modality === "permission" || rule.modality === "prohibition") {
        features.add(rule.modality)
      }
      if (rule.recurs) {
        features.add("recurring")
      }
    } else {
      features.add(rule.kind)
    }
    if (
      (rule.kind === "norm" || rule.kind === "discretion") &&
      (!Array.isArray(rule.overrides) || rule.overrides.length > 0)
    ) {
      features.add("override")
    }
    if (rule.appliesWhen?.type === "text" || JSON.stringify(rule.appliesWhen ?? null).includes('"text"')) {
      features.add("text-condition")
    }
  }
  if (input.crossReference) {
    features.add("cross-reference")
  }
  if (input.provisions.some((provision) => /\bamend/i.test(provision.text))) {
    features.add("amendment")
  }
  if (input.provisions.some((provision) => provision.kind === "definition")) {
    features.add("definition")
  }
  if (input.provisions.some((provision) => provision.noRule !== null)) {
    features.add("no-rule")
  }
  return sorted(features)
}

const topicsOf = (rules: readonly RuleContent[]) => sorted(rules.map((rule) => rule.domain))

function documentLine(golden: T.RulesFile, key: string): DocumentLine {
  const found = golden.documents.find((document) => document.key === key)
  return found
    ? { key: found.key, kind: found.kind, title: found.title, edition: found.edition }
    : { key, kind: "rules", title: key, edition: null }
}

/** The items of every step. */
export function buildDatasets(context: GoldenContext) {
  const { golden, references, splitOf } = context
  const sections = goldenSections(golden, references)
  const section = sectionOf(sections)
  const outlines = goldenOutlines(golden, sections)
  const rules = golden.rules.map(ruleContent)
  const rulesAt = (keys: ReadonlySet<string>) => rules.filter((rule) => keys.has(mainCitation(rule)))
  const crossReferenced = (provisions: readonly T.Provision[]) =>
    provisions.some((provision) =>
      (references.get(provision.key) ?? []).some((target) => section(target) !== section(provision.key))
    )
  const allDefinitions = golden.provisions.filter((provision) => provision.kind === "definition")

  const documents = golden.documents.map((document) => documentLine(golden, document.key))
  // The request types and things the golden adds to the core, as a rebuild would know them from its last rulebook.
  const knownTerms = golden.proposedCore.map(termContent)
  // F gets the whole frozen vocabulary while it fits (prompt drafts v2, section 9): the golden's.
  const vocabulary = goldenTerms(golden)
  // One item per document: a document without definitions runs on its candidates alone. Either way it's expected to
  // define the terms its defining provisions (the same ones the step is given) define under a name it defines.
  const definedTermItems: DefinedTermsItem[] = goldenDocuments(golden).flatMap(({ key, provisions }) => {
    const { definitions, candidates } = definedTermsInput(documentLine(golden, key), provisions)
    const own = definingProvisions(definitions, candidates)
    const definedElsewhere = new Set(
      allDefinitions.filter((provision) => documentOf(provision.key) !== key).map((provision) => provision.key)
    )
    const expected = expectedDefinedTerms(golden, {
      provisions: new Set(own),
      names: definedNamesOf(definitions, candidates)
    }).filter((term) => !term.citations.some((citation) => definedElsewhere.has(citation.provisionKey)))
    if (definitions.length === 0 && expected.length === 0) {
      return []
    }
    return [
      {
        id: `defined-terms:${key}`,
        step: "defined-terms",
        tags: {
          document: key,
          split: splitOf(own[0] ?? ""),
          topics: [],
          features: featuresOf({ rules: [], provisions: definitions, crossReference: false })
        },
        input: { document: documentLine(golden, key), definitions, candidates },
        expected: { terms: expected }
      }
    ]
  })
  // B's terms as C and E receive them: every document's.
  const definedTerms = [
    ...new Map(definedTermItems.flatMap((item) => item.expected.terms).map((term) => [term.key, term])).values()
  ]

  const termCited = new Set(
    goldenTerms(golden).flatMap((term) => term.citations.map((citation) => citation.provisionKey))
  )
  const clauseCited = new Set(settingsFlags(golden).map((flag) => flag.provisionKey))
  const findingItems: RuleFindingItem[] = sections.map((unit) => {
    const keys = new Set(unit.provisions.map((provision) => provision.key))
    const citedElsewhere = new Set(
      outlines.flatMap((outline) => (outline.unitId === unit.id ? [] : [outline.provisionKey, ...outline.citations]))
    )
    const unitRules = rulesAt(keys)
    return {
      id: `rule-finding:${unit.id}`,
      step: "rule-finding",
      tags: {
        document: unit.documentKey,
        split: splitOf(unit.id),
        topics: topicsOf(unitRules),
        features: featuresOf({
          rules: unitRules,
          provisions: unit.provisions,
          crossReference: crossReferenced(unit.provisions)
        })
      },
      input: { unit, documents, definitions: allDefinitions, knownTerms },
      expected: {
        provisions: unit.provisions.map((provision) => ({
          key: provision.key,
          noRule: provision.noRule?.reason ?? null,
          outlines: outlines.filter((outline) => outline.provisionKey === provision.key),
          coveredOutside:
            termCited.has(provision.key) || clauseCited.has(provision.key) || citedElsewhere.has(provision.key)
        })),
        readings: golden.questions
          .filter((question) => question.kind === "interpretation")
          .map((question) =>
            question.options.map((option) => option.keeps.filter((key) => unitRules.some((rule) => rule.key === key)))
          )
          .filter((options) => options.filter((keys) => keys.length > 0).length > 1)
      }
    }
  })

  const outlinesPerUnit = new Map<string, number>()
  for (const outline of outlines) {
    outlinesPerUnit.set(outline.unitId, (outlinesPerUnit.get(outline.unitId) ?? 0) + 1)
  }
  // C is given B's terms and, as E is, the request types and things a last rulebook added to the core.
  const givenToVocabulary = new Set([...definedTerms, ...knownTerms].map((term) => term.key))
  const vocabularyItems: SharedVocabularyItem[] = vocabularyGroups(
    sections,
    (unit) => outlinesPerUnit.get(unit.id) ?? 0
  ).map((group) => {
    const ids = new Set(group.units.map((unit) => unit.id))
    const groupOutlines = outlines.filter((outline) => ids.has(outline.unitId))
    const expected = expectedVocabulary(golden, groupOutlines, givenToVocabulary)
    const cited = new Set(groupOutlines.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
    const groupRules = rules.filter((rule) => groupOutlines.some((outline) => outline.key === rule.key))
    return {
      id: `shared-vocabulary:${group.id}`,
      step: "shared-vocabulary",
      tags: {
        document: group.documentKey,
        split: splitOf(group.id),
        topics: topicsOf(groupRules),
        features: featuresOf({
          rules: groupRules,
          provisions: group.units.flatMap((unit) => unit.provisions),
          crossReference: false
        })
      },
      input: {
        groupId: group.id,
        outlines: outlinesAsFound(groupOutlines, golden, givenToVocabulary),
        provisions: golden.provisions.filter((provision) => cited.has(provision.key)),
        definedTerms,
        previous: knownTerms,
        documents
      },
      expected: { terms: expected.terms, serves: Object.fromEntries(expected.serves) }
    }
  })

  const structuringItems: RuleStructuringItem[] = structuringBatches(
    outlines.filter((outline) => outline.unitId !== "")
  ).map((batch) => {
    const first = batch[0]
    const keys = new Set(batch.map((outline) => outline.key))
    const batchRules = rules.filter((rule) => keys.has(rule.key))
    const targeted = new Set(
      batch.flatMap((outline) => [...(outline.resolved?.rules ?? []), ...(outline.resolved?.except ?? [])])
    )
    const cited = new Set(batch.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
    const provisions = golden.provisions.filter((provision) => cited.has(provision.key))
    return {
      id: `rule-structuring:${first?.key ?? "empty"}`,
      step: "rule-structuring",
      tags: {
        document: documentOf(first?.provisionKey ?? ""),
        split: splitOf(first?.provisionKey ?? ""),
        topics: topicsOf(batchRules),
        features: featuresOf({
          rules: batchRules,
          provisions,
          crossReference: [...targeted].some((key) => !keys.has(key))
        })
      },
      input: {
        batchId: first?.key ?? "",
        outlines: batch,
        related: relatedOutlines(batch, outlines),
        vocabulary,
        documents,
        provisions,
        settingsFlags: settingsFlags(golden).filter((flag) => cited.has(flag.provisionKey))
      },
      expected: { rules: batchRules }
    }
  })

  // Consolidation runs over a whole split; provisions in no split (the guidelines, front matter) make one item too.
  const splits = sorted(golden.provisions.map((provision) => splitOf(provision.key))).filter((split) =>
    rules.some((rule) => splitOf(mainCitation(rule)) === split)
  )
  const consolidationItems: ConsolidationItem[] = splits.map((split) => {
    const inSplit = rules.filter((rule) => splitOf(mainCitation(rule)) === split)
    const sectionOfRule = new Map(inSplit.map((rule) => [rule.key, section(mainCitation(rule))]))
    const removed: { rule: string; target: string }[] = []
    const withoutCrossOverrides = inSplit.map((rule) => {
      if ((rule.kind !== "norm" && rule.kind !== "discretion") || !Array.isArray(rule.overrides)) {
        return rule
      }
      const own = sectionOfRule.get(rule.key)
      const cross = rule.overrides.filter((target) => sectionOfRule.has(target) && sectionOfRule.get(target) !== own)
      removed.push(...cross.map((target) => ({ rule: rule.key, target })))
      return { ...rule, overrides: rule.overrides.filter((target) => !cross.includes(target)) }
    })
    return {
      id: `consolidation:${split}`,
      step: "consolidation",
      tags: {
        document: sorted(inSplit.map((rule) => documentOf(mainCitation(rule)))).join(","),
        split,
        topics: topicsOf(inSplit),
        features: featuresOf({ rules: inSplit, provisions: [], crossReference: removed.length > 0 })
      },
      input: {
        rules: withoutCrossOverrides,
        terms: goldenTerms(golden),
        documents: golden.documents.map((document) => documentLine(golden, document.key)),
        precedence: golden.settings.clauses.precedence.order,
        crossReferences: crossReferenceLines({ rules: withoutCrossOverrides, references, sectionOf: section }),
        exceptions: exceptionLines({ rules: withoutCrossOverrides, sectionOf: section }),
        readings: interpretationReadings(golden).filter((key) => inSplit.some((rule) => rule.key === key))
      },
      expected: { overrides: removed, duplicates: [], conflicts: [] }
    }
  })

  return {
    "defined-terms": definedTermItems,
    "rule-finding": findingItems,
    "shared-vocabulary": vocabularyItems,
    "vocabulary-merge": [syntheticMergeItem(golden)],
    "rule-structuring": structuringItems,
    consolidation: consolidationItems
  }
}

/** The golden settings clauses as E would flag them: provision, clause and what it holds. */
export function settingsFlags(golden: T.RulesFile) {
  const { clauses } = golden.settings
  const flags: { provisionKey: string; clause: string; summary: string }[] = []
  const add = (clause: string, summary: string, citations: readonly T.Citation[]) =>
    flags.push(...citations.map((citation) => ({ provisionKey: citation.provisionKey, clause, summary })))
  add("precedence", "which documents prevail", clauses.precedence.citations)
  add("time", "how days are counted", clauses.time.citations)
  clauses.liability.forEach((item) => add("liability", `${item.liable} answers for ${item.actor}`, item.citations))
  if (clauses.cure) {
    add("cure", "the default cure period", clauses.cure.citations)
  }
  clauses.deciders.forEach((item) => add("deciders", `${item.party} decides ${item.requestType}`, item.citations))
  clauses.sanctionPreconditions.forEach((item) =>
    add("sanctionPreconditions", `before sanctions in ${item.requestTypes.join(", ")}`, item.citations)
  )
  return flags
}

/** A property's thing or a value's set. */
function parentOf(term: TermContent) {
  if (term.kind === "property") {
    return term.of
  }
  return term.kind === "value" ? term.set : null
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")

/**
 * C-merge's synthetic set (prompt drafts v2, test plan): golden properties and values whose documents use a second
 * wording get a duplicate in another group, keyed and labeled by that wording (which the original also lists, so code
 * finds the pair), which must merge back; a few golden
 * properties get a same-key collision of another value type, serving fewer outlines, which must be renamed; and the
 * golden's own lookalikes (distinct terms whose labels match) must stay apart.
 */
export function syntheticMergeItem(golden: T.RulesFile, size = 30, collisions = 5): VocabularyMergeItem {
  const terms = goldenTerms(golden)
  const keys = new Set([...terms, ...coreTerms].map((term) => term.key))
  const serves = new Map<string, string[]>()
  for (const rule of golden.rules) {
    for (const key of keysIn(rule, keys)) {
      serves.set(key, [...(serves.get(key) ?? []), rule.key])
    }
  }
  const origin = (term: TermContent): TermOrigin =>
    term.kind === "thing" || term.kind === "category" ? "defined" : "group 1"
  const entries: VocabularyEntry[] = terms.map((term) => ({
    term,
    serves: serves.get(term.key) ?? [],
    origin: origin(term)
  }))
  const candidates = terms.filter(
    (term) =>
      (term.kind === "property" || term.kind === "value") &&
      term.labels.some((label) => label.role === "alternative" && slug(label.text) !== "")
  )
  const step = Math.max(1, Math.floor(candidates.length / size))
  const merges: { keep: string; merge: string[] }[] = []
  for (const term of candidates.filter((_term, index) => index % step === 0).slice(0, size)) {
    const alternative = term.labels.find((label) => label.role === "alternative" && slug(label.text) !== "")
    const parent = parentOf(term) ?? ""
    const key = `${parent}.${slug(alternative?.text ?? "")}`
    if (!alternative || keys.has(key)) {
      continue
    }
    keys.add(key)
    entries.push({
      term: { ...term, key, labels: [{ ...alternative, role: "preferred" }] },
      serves: [],
      origin: "group 2"
    })
    merges.push({ keep: term.key, merge: [key] })
  }
  const merged = new Set(merges.map((merge) => merge.keep))
  const renames: { key: string; origin: TermOrigin }[] = []
  for (const term of terms.filter(
    (item) => item.kind === "property" && item.valueType.type !== "boolean" && !merged.has(item.key)
  )) {
    if (renames.length >= collisions || term.kind !== "property") {
      break
    }
    entries.push({ term: { ...term, valueType: { type: "boolean" } }, serves: [], origin: "group 3" })
    renames.push({ key: term.key, origin: "group 3" })
  }
  const lookalikes = candidateTermPairs(terms)
    .filter((pair) => !pair.keys.some((key) => merged.has(key) || renames.some((rename) => rename.key === key)))
    .slice(0, size)
  return {
    id: "vocabulary-merge:synthetic",
    step: "vocabulary-merge",
    tags: {
      document: sorted(golden.documents.map((document) => document.key)).join(","),
      split: "synthetic",
      topics: [],
      features: ["duplicate", "collision", "lookalike"]
    },
    input: { entries },
    expected: { merges, renames, distinct: sorted(lookalikes.flatMap((pair) => pair.keys)) }
  }
}
