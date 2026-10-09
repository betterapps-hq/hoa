import { candidateTypes, rootTypes } from "@/review/candidates"
import { definitionOf, rulebookVocabulary, scopeNoteOf } from "@/review/documentTypes"
import { planFacts, type PlannedProperty } from "@/review/factPlan"
import { selectRules } from "@/review/select"
import { workType } from "@/review/subjects"
import type * as T from "@/schema/types"
import type { ProjectDocument, ProjectField, ProjectGroup, ProjectTypeDefinition } from "./projectType"

// Project type definitions from the rulebook (application-review.md, Project types), by code: the subjects a project
// type can cover are the things the application rules apply to; its form asks for every property the rules about
// those subjects test, typed by the vocabulary; its documents are the ones those rules require. Nothing here knows any
// organization's terms: it walks the rules and their vocabulary.

export type ProjectSubject = {
  key: T.TermKey
  label: string
  definition: string | null
  scopeNote: string | null
  /** Its kinds (the rulebook's categories of it), each with what makes a thing that kind. */
  kinds: { key: T.TermKey; label: string; definition: string | null }[]
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A definition as a form's help text: a sentence. */
const helpOf = (text: string | null) => (text ? `${sentenceCase(text.trim()).replace(/[.]?$/, ".")}` : null)

/** A unit as a form shows it: its longest label in words ("inches" rather than "in" or a mark). */
const unitWord = (labels: readonly string[]) =>
  labels.filter((label) => /^[a-z ]+$/i.test(label)).toSorted((a, b) => b.length - a.length)[0] ?? labels[0] ?? ""

/** The things an application's rules apply to that a homeowner's project can include, parties and documents aside. */
export function projectSubjects(rulesFile: T.RulesFile, requestType: T.TermKey): ProjectSubject[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  return candidateTypes(rulesFile, requestType)
    .filter((candidate) => {
      const term = vocabulary.get(candidate.key)
      return candidate.key !== workType && term?.kind === "thing" && term.nature === "object"
    })
    .map((candidate) => ({
      key: candidate.key,
      label: vocabulary.label(candidate.key),
      definition: candidate.definition,
      scopeNote: candidate.scopeNote,
      kinds: candidate.categories.map((category) => ({
        key: category.key,
        label: category.labels[0] ?? category.key,
        definition: category.definition
      }))
    }))
}

/** The rules a project of these subjects is reviewed against: theirs, the work's, the request's and the lot's. */
export function projectRules(
  rulesFile: T.RulesFile,
  requestType: T.TermKey,
  subjects: readonly T.TermKey[],
  on: T.IsoDate
): T.RuleKey[] {
  return selectRules(rulesFile, {
    type: requestType,
    governingDate: on,
    entityTypes: [...rootTypes(requestType), workType, ...subjects],
    lotRef: null
  })
}

function fieldOf(property: PlannedProperty, vocabulary: ReturnType<typeof rulebookVocabulary>): ProjectField | null {
  const base = {
    property: property.key,
    label: sentenceCase(property.labels[0] ?? property.key),
    help: helpOf(property.definition ?? scopeNoteOf(vocabulary, property.key)),
    isRequired: false
  }
  switch (property.valueType.type) {
    case "quantity":
      return {
        ...base,
        kind: "number",
        unit: property.unit ? { key: property.unit.key, label: unitWord(property.unit.labels) } : null
      }
    case "count":
      return { ...base, kind: "number", unit: null }
    case "boolean":
      return { ...base, kind: "yes-no" }
    case "choice":
      return property.values && property.values.length > 0
        ? {
            ...base,
            kind: "choice",
            options: property.values.map((value) => ({ value: value.key, label: value.labels[0] ?? value.key })),
            allowsOther: property.isComplete !== true
          }
        : { ...base, kind: "text" }
    case "date":
    case "date-time":
      return { ...base, kind: "date" }
    case "text":
      return { ...base, kind: "long-text" }
    default:
      // References, parties, times of day and schedules aren't asked in the form; the packet and the review read them.
      return null
  }
}

/** The documents the selected rules require, one per document type, with everything each must show. */
function documentsOf(
  rulesFile: T.RulesFile,
  selected: ReadonlySet<T.RuleKey>,
  vocabulary: ReturnType<typeof rulebookVocabulary>
) {
  const byType = new Map<T.TermKey, ProjectDocument>()
  for (const rule of rulesFile.rules) {
    if (!selected.has(rule.key) || rule.kind !== "norm" || rule.check?.type !== "document") {
      continue
    }
    const { document, mustState } = rule.check
    const found = byType.get(document) ?? {
      documentType: document,
      label: sentenceCase(vocabulary.label(document)),
      mustShow: [],
      ruleKeys: [],
      isRequired: false
    }
    found.mustShow = [...new Set([...found.mustShow, ...mustState])]
    found.ruleKeys = [...new Set([...found.ruleKeys, rule.key])]
    found.isRequired = found.isRequired || rule.modality === "obligation"
    byType.set(document, found)
  }
  return [...byType.values()]
}

/**
 * The full definition for a project of these subjects: a group for the work and one per subject, each asking every
 * property the rules test of it that a homeowner can state, and every document the rules require.
 */
export function buildDefinition(
  rulesFile: T.RulesFile,
  requestType: T.TermKey,
  subjects: readonly T.TermKey[],
  on: T.IsoDate
): ProjectTypeDefinition {
  const vocabulary = rulebookVocabulary(rulesFile)
  const selected = projectRules(rulesFile, requestType, subjects, on)
  const plan = planFacts(rulesFile, selected, requestType)
  const groupFor = (subject: T.TermKey): ProjectGroup => {
    const isWork = subject === workType
    return {
      subject,
      label: isWork ? "The project" : sentenceCase(vocabulary.label(subject, true)),
      itemLabel: isWork ? "The project" : sentenceCase(vocabulary.label(subject)),
      help: isWork ? null : helpOf(definitionOf(vocabulary, subject)),
      isRepeatable: !isWork,
      fields: plan.properties
        .filter((property) => property.owner === subject)
        .flatMap((property) => fieldOf(property, vocabulary) ?? [])
    }
  }
  return {
    subjects: [...subjects],
    groups: [workType, ...subjects].map(groupFor).filter((group) => group.fields.length > 0),
    documents: documentsOf(rulesFile, new Set(selected), vocabulary)
  }
}

/**
 * A definition checked against the one the rules give for its subjects: every field must be one the rules ask (its
 * kind, unit and options come from the vocabulary; its label, help and whether it's required are the
 * administrator's), and every document one the rules require. Anything else is dropped.
 */
export function bindDefinition(definition: ProjectTypeDefinition, built: ProjectTypeDefinition): ProjectTypeDefinition {
  const groups = definition.groups.flatMap((group) => {
    const rules = built.groups.find((item) => item.subject === group.subject)
    if (!rules) {
      return []
    }
    const fields = group.fields.flatMap((field) => {
      const bound = rules.fields.find((item) => item.property === field.property)
      return bound ? [{ ...bound, label: field.label, help: field.help, isRequired: field.isRequired }] : []
    })
    return fields.length > 0 ? [{ ...rules, label: group.label, itemLabel: group.itemLabel, fields }] : []
  })
  const labels = new Map(definition.documents.map((document) => [document.documentType, document.label]))
  return {
    subjects: built.subjects,
    groups,
    documents: built.documents.map((document) => ({
      ...document,
      label: labels.get(document.documentType) ?? document.label
    }))
  }
}
