import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, ProvisionKey } from "@/schema/types"
import { condition, provisionKey, termDraft, termKey, type TermContent } from "@/schema/zod"
import type { TermCandidate } from "../definedTerms"
import { candidateText, coreTermsText, documentLine, provisionBlock } from "../promptVariables"
import { mergeLabels } from "../records"
import { recordProblems, repeatedKeys, type StepProblem } from "./check"
import {
  citationsOf,
  coreKeys,
  keyEnum,
  keysIn,
  labelsDraft,
  labelsOf,
  newKey,
  propertyFields,
  propertyTerm,
  segment,
  thingNature,
  valueSetTerms
} from "./drafts"
import { none, type stepPrompts } from "./prompts"

// B. Defined terms (hoa-term-extraction, prompt drafts v2): the things, parties and categories a document defines, the
// properties, value sets and values a category's own criteria read, and refinements of core terms. One call per
// document, alongside E; a document without definitions runs on its capitalized-phrase candidates alone. Code converts
// the answer to terms and checks them: keys unique, citations only to this call's provisions, criteria resolving.

const citations = z.array(provisionKey).min(1)
const definition = z.string().nullable()

/** B's answer: one fixed format; code checks that citations name this call's definitions or candidates' provisions. */
export const definedTermsAnswer = z.object({
  things: z.array(z.object({ key: newKey, nature: thingNature, ...labelsDraft, definition, citations })),
  categories: z.array(
    z.object({ key: newKey, of: termKey, ...labelsDraft, definition, criteria: condition, citations })
  ),
  criteriaTerms: z.object({
    properties: z.array(z.object(propertyFields)),
    valueSets: z.array(
      z.object({
        name: segment,
        ...labelsDraft,
        complete: z.boolean(),
        values: z.array(z.object({ name: segment, ...labelsDraft })).min(1)
      })
    )
  }),
  refinements: z.array(z.object({ key: keyEnum(coreKeys), ...labelsDraft, definition, citations })),
  notes: z.array(z.string())
})
export type DefinedTermsAnswer = z.output<typeof definedTermsAnswer>

/** The provisions an answer may cite: the definitions and every provision a candidate is defined in. */
export const citableProvisions = (
  definitions: readonly Provision[],
  candidates: readonly { definedIn: string[] }[]
) => [...new Set([...definitions.map((provision) => provision.key), ...candidates.flatMap((item) => item.definedIn)])]

/** hoa-term-extraction's variables for one document; `problems` lists failing terms on a rerun. */
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
    candidates: none(input.candidates.map(candidateText).join("\n")),
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
 * The answer as terms: things, categories, refinements of core terms, and the criteria's properties and value sets,
 * each cited to the citations of the categories that read it.
 */
export function definedTermsOf(answer: DefinedTermsAnswer): TermContent[] {
  const categories = answer.categories.map((category) =>
    termDraft.parse({
      key: category.key,
      kind: "category",
      of: category.of,
      criteria: category.criteria,
      labels: labelsOf(category),
      definition: category.definition,
      citations: citationsOf(category.citations)
    })
  )
  const citedBy = (key: string) => [
    ...new Set(
      answer.categories.flatMap((category) => {
        const read = keysIn(category.criteria, new Set([key]))
        const values = JSON.stringify(category.criteria).includes(`"${key}.`)
        return read.size > 0 || values ? category.citations : []
      })
    )
  ]
  return [
    ...answer.things.map((thing) =>
      termDraft.parse({
        key: thing.key,
        kind: "thing",
        nature: thing.nature,
        request: null,
        labels: labelsOf(thing),
        definition: thing.definition,
        citations: citationsOf(thing.citations)
      })
    ),
    ...categories,
    ...answer.criteriaTerms.properties.map((property) =>
      propertyTerm(property, citedBy(`${property.of}.${property.name}`))
    ),
    ...answer.criteriaTerms.valueSets.flatMap((set) => valueSetTerms(set, set.values, citedBy(set.name))),
    ...answer.refinements.flatMap(refinement)
  ]
}

/** B's check: keys unique, every reference in the terms resolving, citations only to the provisions it was given. */
export function checkDefinedTerms(
  terms: readonly TermContent[],
  provisions: readonly Provision[],
  citable: readonly ProvisionKey[]
): StepProblem[] {
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
  return [...stray, ...repeated, ...recordProblems({ terms: unique, provisions })]
}
