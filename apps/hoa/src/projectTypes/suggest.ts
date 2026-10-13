import { z } from "zod"
import { meaningOf, rulebookVocabulary } from "@/review/documentTypes"
import { workType } from "@/review/subjects"
import type * as T from "@/schema/types"
import { buildDefinition, projectRules, projectSubjects } from "./build"
import type { ProjectType, ProjectTypeDefinition } from "./projectType"

// Project types the rulebook suggests (application-review.md, Project types). A model reads the rulebook as it
// applies to applications and proposes project types; code then checks every proposal against the rules: subjects
// must be things the rules apply to, every field must be a property those rules test, and documents come from the
// rules that require them. Anything that doesn't bind is dropped, so a suggestion never asks for what no rule reads.

export const suggestionAnswerSchema = z.object({
  suggestions: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      subjects: z.array(z.string()).describe("Subject keys from the rulebook's subjects."),
      fields: z.array(
        z.object({
          subject: z.string().describe('A subject key, or "work" for the project as a whole.'),
          property: z.string().describe("A property key listed under that subject."),
          label: z.string(),
          help: z.string().nullable(),
          isRequired: z.boolean()
        })
      ),
      documents: z.array(z.object({ documentType: z.string(), label: z.string() })),
      basis: z.array(z.string()).describe("Rule keys from the rulebook.")
    })
  )
})
export type SuggestionAnswer = z.infer<typeof suggestionAnswerSchema>

export type ProjectTypeSuggestion = {
  label: string
  description: string
  definition: ProjectTypeDefinition
  /** The rules the suggestion rests on, as keys the rulebook has. */
  basis: T.RuleKey[]
}

const json = (value: unknown) => JSON.stringify(value)

/** The rulebook as the suggestion prompt reads it: subjects with their rules and tested details, work kinds, documents. */
export function rulebookForPrompt(rulesFile: T.RulesFile, requestType: T.TermKey, on: T.IsoDate) {
  const vocabulary = rulebookVocabulary(rulesFile)
  const subjects = projectSubjects(rulesFile, requestType)
  const titles = new Map(rulesFile.rules.map((rule) => [rule.key, rule.title]))
  const rulesAbout = (subject: T.TermKey) =>
    rulesFile.rules.filter(
      (rule) =>
        (rule.kind === "norm" || rule.kind === "discretion") &&
        rule.requestTypes.includes(requestType) &&
        rule.appliesTo !== null &&
        vocabulary.thingOf(rule.appliesTo) === subject
    )
  const detailsOf = (definition: ProjectTypeDefinition, subject: T.TermKey) =>
    definition.groups
      .find((group) => group.subject === subject)
      ?.fields.map((field) => ({ property: field.property, label: field.label, type: field.kind })) ?? []
  const base = buildDefinition(rulesFile, requestType, [], on)
  const terms = [...rulesFile.proposedCore, ...rulesFile.terms]
  const workSets = new Set(
    terms.flatMap((term) =>
      term.kind === "property" &&
      term.derived === null &&
      term.valueType.type === "choice" &&
      vocabulary.thingOf(term.of) === workType
        ? [term.valueType.set]
        : []
    )
  )
  const workKinds = terms
    .filter(
      (term) =>
        (term.kind === "category" && vocabulary.thingOf(term.key) === workType) ||
        (term.kind === "value" && workSets.has(term.set))
    )
    .map((term) => ({ key: term.key, label: vocabulary.label(term.key), covers: meaningOf(vocabulary, term.key) }))
  const allSubjects = buildDefinition(
    rulesFile,
    requestType,
    subjects.map((subject) => subject.key),
    on
  )
  const projectWide = new Set(projectRules(rulesFile, requestType, [], on))
  return json({
    subjects: [
      { key: workType, label: vocabulary.label(workType), details: detailsOf(base, workType) },
      ...subjects.map((subject) => ({
        key: subject.key,
        label: subject.label,
        definition: subject.definition,
        ...(subject.scopeNote ? { scopeNote: subject.scopeNote } : {}),
        ...(subject.kinds.length > 0 ? { kinds: subject.kinds } : {}),
        rules: rulesAbout(subject.key).map((rule) => ({ key: rule.key, title: rule.title })),
        details: detailsOf(allSubjects, subject.key)
      }))
    ],
    workKinds,
    documents: allSubjects.documents.map((document) => ({
      key: document.documentType,
      label: document.label,
      rules: document.ruleKeys
    })),
    projectRules: [...projectWide].map((key) => ({ key, title: titles.get(key) ?? key }))
  })
}

export const projectTypesForPrompt = (types: readonly Pick<ProjectType, "label" | "description">[]) =>
  types.length > 0 ? json(types.map((type) => ({ label: type.label, description: type.description }))) : "none"

const normalized = (text: string) => text.trim().toLowerCase()

/** The model's suggestions, each checked against the rulebook; ones that bind to nothing are left out. */
export function checkSuggestions(
  answer: SuggestionAnswer,
  context: {
    rulesFile: T.RulesFile
    requestType: T.TermKey
    on: T.IsoDate
    existing: readonly Pick<ProjectType, "label">[]
  }
): ProjectTypeSuggestion[] {
  const { rulesFile, requestType, on } = context
  const subjectKeys = new Set(projectSubjects(rulesFile, requestType).map((subject) => subject.key))
  const ruleKeys = new Set(rulesFile.rules.map((rule) => rule.key))
  const taken = new Set(context.existing.map((type) => normalized(type.label)))
  return answer.suggestions.flatMap((suggestion) => {
    const label = suggestion.label.trim()
    const basis = suggestion.basis.filter((key) => ruleKeys.has(key))
    if (!label || taken.has(normalized(label)) || basis.length === 0) {
      return []
    }
    taken.add(normalized(label))
    const subjects = [...new Set(suggestion.subjects.filter((key) => subjectKeys.has(key)))]
    const built = buildDefinition(rulesFile, requestType, subjects, on)
    const chosen = new Map(suggestion.fields.map((field) => [`${field.subject} ${field.property}`, field]))
    // A pick names a field by its key ("fence-run.height") or, as models often write it, without its subject's prefix
    // ("height" under "fence-run"); otherwise none of its picks bind and the subject's whole form stands in.
    const pickOf = (subject: string, property: string) =>
      chosen.get(`${subject} ${property}`) ??
      (property.startsWith(`${subject}.`) ? chosen.get(`${subject} ${property.slice(subject.length + 1)}`) : undefined)
    const groups = built.groups.map((group) => {
      const picked = group.fields.flatMap((field) => {
        const pick = pickOf(group.subject, field.property)
        return pick
          ? [
              {
                ...field,
                label: pick.label.trim() || field.label,
                help: pick.help?.trim() || field.help,
                isRequired: pick.isRequired
              }
            ]
          : []
      })
      return { ...group, fields: picked }
    })
    const hasPicks = groups.some((group) => group.fields.length > 0)
    const labels = new Map(suggestion.documents.map((document) => [document.documentType, document.label.trim()]))
    const definition: ProjectTypeDefinition = {
      subjects,
      groups: hasPicks ? groups.filter((group) => group.fields.length > 0) : built.groups,
      documents: built.documents.map((document) => ({
        ...document,
        label: labels.get(document.documentType) || document.label
      })),
      formDocuments: built.formDocuments,
      unasked: []
    }
    if (definition.groups.length === 0 && definition.documents.length === 0) {
      return []
    }
    return [{ label, description: suggestion.description.trim(), definition, basis }]
  })
}
