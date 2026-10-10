import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, ProvisionKey, TermKey } from "@/schema/types"
import { condition, decimal, dimension, provisionKey, termDraft, type TermContent } from "@/schema/zod"
import type { TermCandidate } from "../definedTerms"
import { candidateText, coreTermsText, documentLine, provisionBlock } from "../promptVariables"
import { mergeLabels } from "../records"
import { recordProblems, repeatedKeys, type StepProblem } from "./check"
import {
  citationsOf,
  coreKeys,
  keyEnum,
  keysIn,
  labeledPropertyFields,
  labelsDraft,
  labelsOf,
  propertyTerm,
  reference,
  thingNature,
  valueSetTerm,
  valueTerm
} from "./drafts"
import { none, type stepPrompts } from "./prompts"
import { termKeyBuilder } from "./termKeys"

// B. Defined terms (hoa-defined-terms, prompt drafts v2): the things, parties and categories a document defines, the
// properties, value sets, values and units a category's own criteria read, and refinements of core terms. One call per
// document, alongside E; a document without definitions runs on its capitalized-phrase candidates alone. The model
// writes no term key: code builds each from the term's preferred label (termKeys.ts), resolves `of` and the criteria's
// references by label or key, and checks the terms: citations only to this call's provisions (the definitions, the
// provisions candidates are defined in, and a used candidate's sample provisions), criteria resolving.

const citations = z.array(provisionKey).min(1)
const definition = z.string().nullable()

/** B's answer: one fixed format; code builds the keys and checks that citations name this call's provisions. */
export const definedTermsAnswer = z.object({
  things: z.array(z.object({ nature: thingNature, ...labelsDraft, definition, citations })),
  categories: z.array(z.object({ of: reference, ...labelsDraft, definition, criteria: condition, citations })),
  criteriaTerms: z.object({
    properties: z.array(z.object(labeledPropertyFields)),
    valueSets: z.array(
      z.object({ ...labelsDraft, complete: z.boolean(), values: z.array(z.object({ ...labelsDraft })).min(1) })
    ),
    /** A unit a criterion's quantity is in that isn't a core unit. */
    units: z.array(z.object({ ...labelsDraft, dimension, perBase: decimal.nullable() }))
  }),
  refinements: z.array(z.object({ key: keyEnum(coreKeys), ...labelsDraft, definition, citations })),
  notes: z.array(z.string())
})
export type DefinedTermsAnswer = z.output<typeof definedTermsAnswer>

/** The provisions that define terms: the definitions and every provision a candidate is defined in. */
export const definingProvisions = (
  definitions: readonly Pick<Provision, "key">[],
  candidates: readonly Pick<TermCandidate, "definedIn">[]
) => [...new Set([...definitions.map((provision) => provision.key), ...candidates.flatMap((item) => item.definedIn)])]

/**
 * The provisions an answer may cite: the defining provisions, and for a candidate found only in use, the provisions
 * its samples come from.
 */
export const citableProvisions = (
  definitions: readonly Pick<Provision, "key">[],
  candidates: readonly Pick<TermCandidate, "definedIn" | "source" | "samples">[]
) => [
  ...new Set([
    ...definingProvisions(definitions, candidates),
    ...candidates.flatMap((item) => (item.source === "usage" ? item.samples.map((sample) => sample.provisionKey) : []))
  ])
]

/** hoa-defined-terms's variables for one document; `problems` lists failing terms on a rerun. */
export function definedTermsVariables(input: {
  document: Pick<GoverningDocument, "key" | "kind" | "title" | "edition">
  definitions: readonly Provision[]
  candidates: readonly TermCandidate[]
  problems?: string
}): PromptVariables<typeof stepPrompts.definedTerms> {
  return {
    coreTerms: coreTermsText(),
    document: documentLine(input.document),
    definitions: none(input.definitions.map(provisionBlock).join("\n\n")),
    candidates: none(input.candidates.map((candidate) => candidateText(candidate, true)).join("\n")),
    problems: input.problems ?? "none"
  }
}

/** A core term refined with the document's labels and definition: same key and kind, the core labels kept. */
function refinement(item: DefinedTermsAnswer["refinements"][number]): TermContent[] {
  const core = coreTerms.find((term) => term.key === item.key)
  if (!core) {
    return []
  }
  const { provenance: _provenance, review: _review, issues: _issues, labels, ...content } = core
  const refined = termDraft.parse({
    ...content,
    labels: labelsOf(item),
    definition: item.definition ?? core.definition,
    citations: citationsOf(item.citations)
  })
  mergeLabels(
    refined,
    labels.map(({ provenance: _labelProvenance, ...label }) => label)
  )
  return [refined]
}

/**
 * The answer as terms, with the problems building them: keys built from preferred labels (things, categories, value
 * sets and units first, then values under their sets and properties under their things), `of` and the criteria's
 * references resolved by label or key, and the criteria's properties and value sets cited to the citations of the
 * categories that read them.
 */
export function definedTermsOf(answer: DefinedTermsAnswer): { terms: TermContent[]; problems: StepProblem[] } {
  const keys = termKeyBuilder()
  for (const item of answer.refinements) {
    keys.addLabels(item.key, [item.preferred.text, ...item.alternatives])
  }
  const thingKeys = answer.things.map((thing) => keys.build(thing, null, "thing"))
  const categoryKeys = answer.categories.map((category) => keys.build(category, null, "category"))
  const setKeys = answer.criteriaTerms.valueSets.map((set) => keys.build(set, null, "value set"))
  const unitKeys = answer.criteriaTerms.units.map((unit) => keys.build(unit, null, "unit"))
  const valueKeys = answer.criteriaTerms.valueSets.map((set, index) => {
    const setKey = setKeys[index] ?? null
    return set.values.map((value) => (setKey === null ? null : keys.build(value, setKey, "value")))
  })
  const propertyKeys = answer.criteriaTerms.properties.map((property) => {
    const of = keys.named(property.of, property.preferred.text, "of")
    return of === null ? null : { of, key: keys.build(property, of, "property") }
  })
  const categories = answer.categories.flatMap((category, index) => {
    const key = categoryKeys[index]
    const of = key ? keys.named(category.of, key, "of") : null
    if (!key || !of) {
      return []
    }
    const criteria = keys.rewrite(category.criteria)
    const term = termDraft.parse({
      key,
      kind: "category",
      of,
      criteria,
      labels: labelsOf(category),
      definition: category.definition,
      citations: citationsOf(category.citations)
    })
    return [{ term, criteria, citations: category.citations }]
  })
  const citedBy = (key: TermKey): ProvisionKey[] => [
    ...new Set(
      categories.flatMap((category) => {
        const read =
          keysIn(category.criteria, new Set([key])).size > 0 || JSON.stringify(category.criteria).includes(`"${key}.`)
        return read ? category.citations : []
      })
    )
  ]
  const terms = [
    ...answer.things.flatMap((thing, index) => {
      const key = thingKeys[index]
      return key
        ? [
            termDraft.parse({
              key,
              kind: "thing",
              nature: thing.nature,
              request: null,
              labels: labelsOf(thing),
              definition: thing.definition,
              citations: citationsOf(thing.citations)
            })
          ]
        : []
    }),
    ...categories.map((category) => category.term),
    ...answer.criteriaTerms.properties.flatMap((property, index) => {
      const built = propertyKeys[index]
      return built?.key
        ? [
            propertyTerm(
              { ...property, valueType: keys.rewrite(property.valueType) },
              built.key,
              built.of,
              citedBy(built.key)
            )
          ]
        : []
    }),
    ...answer.criteriaTerms.valueSets.flatMap((set, index) => {
      const setKey = setKeys[index]
      if (!setKey) {
        return []
      }
      const cited = citedBy(setKey)
      return [
        valueSetTerm(set, setKey, cited),
        ...set.values.flatMap((value, valueIndex) => {
          const key = valueKeys[index]?.[valueIndex]
          return key ? [valueTerm(value, key, setKey, [], cited)] : []
        })
      ]
    }),
    ...answer.criteriaTerms.units.flatMap((unit, index) => {
      const key = unitKeys[index]
      return key
        ? [
            termDraft.parse({
              key,
              kind: "unit",
              dimension: unit.dimension,
              perBase: unit.perBase,
              labels: labelsOf(unit)
            })
          ]
        : []
    }),
    ...answer.refinements.flatMap(refinement)
  ]
  return { terms, problems: keys.problems }
}

/** A provision named by its key alone, as the validator reads a citation (its label is the key's label part). */
const citableProvision = (key: ProvisionKey) => ({ key, label: key.slice(key.indexOf(":") + 1) })

/**
 * B's check: keys unique, every reference in the terms resolving, citations only to the provisions it was given (the
 * definitions and the candidates' provisions, `citableProvisions`).
 */
export function checkDefinedTerms(terms: readonly TermContent[], citable: readonly ProvisionKey[]): StepProblem[] {
  const allowed = new Set(citable)
  const stray = terms.flatMap((term) =>
    term.citations
      .filter((citation) => !allowed.has(citation.provisionKey))
      .map((citation) => ({
        recordKey: term.key,
        code: "citation-not-given",
        message: `${term.key} cites ${citation.provisionKey}, which isn't a definition or a candidate's provision`,
        path: ["citations"]
      }))
  )
  const repeated = repeatedKeys(terms.map((term) => term.key)).map((key) => ({
    recordKey: key,
    code: "duplicate-key",
    message: `${key} is returned more than once`,
    path: ["key"]
  }))
  const unique = [...new Map(terms.map((term) => [term.key, term])).values()]
  return [...stray, ...repeated, ...recordProblems({ terms: unique, provisions: citable.map(citableProvision) })]
}
