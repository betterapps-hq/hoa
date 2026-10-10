import { createEngineVocabulary } from "@/engine/vocabulary"
import { sentenceCase } from "@/lib/text"
import { candidateTypes, rootTypes } from "@/review/candidates"
import { formKindOf } from "@/review/documents"
import { definitionOf, labelsOf, rulebookVocabulary, scopeNoteOf } from "@/review/documentTypes"
import { planFacts, type PlannedProperty } from "@/review/factPlan"
import { unitLabels } from "@/review/normalize"
import { selectRules } from "@/review/select"
import { workType } from "@/review/subjects"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { UnitLabels } from "@/text/quantity"
import { allQuestions, askApplicants, projectSection } from "./definition"
import type { ProjectDocument, ProjectField, ProjectGroup, ProjectTypeDefinition } from "./projectType"
import { fallbackQuestion } from "./wording"

// Project type definitions from the rulebook (application-review.md, Project types), by code: the subjects a project
// type can cover are the things the application rules apply to; its form asks for every property the rules about
// those subjects test, typed by the vocabulary and citing the rules that read it; its documents are the ones those
// rules require. The administrator's own questions sit beside them. Nothing here knows any organization's terms: it
// walks the rules and their vocabulary.

export type ProjectSubject = {
  key: T.TermKey
  label: string
  definition: string | null
  scopeNote: string | null
  /** Its kinds (the rulebook's categories of it), each with what makes a thing that kind. */
  kinds: { key: T.TermKey; label: string; definition: string | null }[]
}

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

type Vocabulary = ReturnType<typeof rulebookVocabulary>

function dimensionOf(unit: T.TermKey, vocabulary: Vocabulary) {
  const term = vocabulary.get(unit)
  return term?.kind === "unit" ? term.dimension : null
}

/** The units an amount in this unit can be given in: its own first, then the others of its dimension that convert. */
function unitsLike(unit: T.TermKey, units: readonly UnitLabels[], vocabulary: Vocabulary) {
  const dimension = dimensionOf(unit, vocabulary)
  const own = units.filter((item) => item.unit === unit)
  const others = units.filter(
    (item) =>
      item.unit !== unit &&
      item.perBase !== null &&
      dimension !== null &&
      dimensionOf(item.unit, vocabulary) === dimension
  )
  return [...own, ...others].map((item) => ({ ...item, labels: [...item.labels] }))
}

/** Every unit the vocabulary has (the portal's alone without a rulebook), with what it measures. */
export function vocabularyUnits(rulesFile: T.RulesFile | null) {
  const own = rulesFile ? [...rulesFile.proposedCore, ...rulesFile.terms] : []
  const vocabulary = createEngineVocabulary(own)
  return [...coreTerms, ...own].flatMap((term) => {
    if (term.kind !== "unit" || vocabulary.get(term.key) !== term) {
      return []
    }
    const labels = labelsOf(vocabulary, term.key)
    return [
      {
        unit: term.key,
        labels: [term.key, ...labels],
        perBase: term.perBase,
        dimension: term.dimension,
        label: unitWord(labels)
      }
    ]
  })
}

type FieldContext = {
  vocabulary: Vocabulary
  units: readonly UnitLabels[]
  /** The thing the question is about, as a question names it: "fence run", or "project" for the work. */
  subject: string
  /** The provisions the rules that read each property cite. */
  citations: ReadonlyMap<string, string[]>
  /** The properties a rule checks at application reads; the rest only decide exemptions or later deadlines. */
  checked: ReadonlySet<string>
}

function fieldOf(property: PlannedProperty, context: FieldContext): ProjectField | null {
  const { vocabulary, units, subject } = context
  const name = property.labels[0] ?? property.key
  const base = {
    property: property.key,
    binding: property.key,
    help: helpOf(property.definition ?? scopeNoteOf(vocabulary, property.key)),
    example: null,
    isRequired: false,
    answeredBy: context.checked.has(property.key) ? ("applicant" as const) : ("association" as const),
    citations: context.citations.get(property.key) ?? []
  }
  const worded = (kind: ProjectField["kind"]) => ({ ...base, label: fallbackQuestion(name, kind, subject) })
  switch (property.valueType.type) {
    case "quantity":
      return {
        ...worded("number"),
        kind: "number",
        unit: property.unit ? { key: property.unit.key, label: unitWord(property.unit.labels) } : null,
        dimension: property.unit ? dimensionOf(property.unit.key, vocabulary) : null,
        units: property.unit ? unitsLike(property.unit.key, units, vocabulary) : []
      }
    case "count":
      return { ...worded("number"), kind: "number", unit: null, dimension: null, units: [] }
    case "boolean":
      return { ...worded("yes-no"), kind: "yes-no" }
    case "choice":
      return property.values && property.values.length > 0
        ? {
            ...worded("choice"),
            kind: "choice",
            options: property.values.map((value) => ({ value: value.key, label: value.labels[0] ?? value.key })),
            allowsOther: property.isComplete !== true
          }
        : { ...worded("text"), kind: "text" }
    case "date":
    case "date-time":
      return { ...worded("date"), kind: "date" }
    case "time-of-day":
      return { ...worded("time"), kind: "time" }
    case "text":
      return { ...worded("long-text"), kind: "long-text" }
    default:
      // References, parties and schedules aren't asked in the form; the packet and the review read them.
      return null
  }
}

/**
 * The documents the selected rules require, one per document type, with everything each must show: the ones the
 * homeowner uploads, and the ones the application form itself provides (`formKindOf`), which are never uploads. An
 * upload that must be signed says by whom ("signed by every owner"), which also tells it apart from the form when the
 * form provides the same kind of document unsigned.
 */
function documentsOf(rulesFile: T.RulesFile, selected: ReadonlySet<T.RuleKey>, vocabulary: Vocabulary) {
  const uploads = new Map<T.TermKey, ProjectDocument>()
  const fromForm = new Map<T.TermKey, ProjectDocument>()
  const signers = new Map<T.TermKey, Set<string>>()
  for (const rule of rulesFile.rules) {
    if (!selected.has(rule.key) || rule.kind !== "norm" || rule.check?.type !== "document") {
      continue
    }
    const { check } = rule
    const isFromForm = formKindOf(check, vocabulary) !== null
    const byType = isFromForm ? fromForm : uploads
    const found = byType.get(check.document) ?? {
      documentType: check.document,
      label: sentenceCase(vocabulary.label(check.document)),
      mustShow: [],
      ruleKeys: [],
      isRequired: false,
      citations: [],
      accepts: null
    }
    found.mustShow = [...new Set([...found.mustShow, ...check.mustState])]
    found.ruleKeys = [...new Set([...found.ruleKeys, rule.key])]
    found.isRequired = found.isRequired || rule.modality === "obligation"
    byType.set(check.document, found)
    if (!isFromForm) {
      const signing = check.signedBy.map(
        (party) => `${check.per === "request" ? "every" : "the"} ${vocabulary.label(party)}`
      )
      signers.set(check.document, new Set([...(signers.get(check.document) ?? []), ...signing]))
    }
  }
  const documents = [...uploads.values()].map((document) => {
    const signing = [...(signers.get(document.documentType) ?? [])]
    return signing.length > 0
      ? { ...document, label: `${document.label} signed by ${signing.join(" and ")}` }
      : document
  })
  return { documents, formDocuments: [...fromForm.values()] }
}

/** Which selected rules read each property a project of these subjects is asked, so every question can cite them. */
export function propertyRules(
  rulesFile: T.RulesFile,
  requestType: T.TermKey,
  subjects: readonly T.TermKey[],
  on: T.IsoDate
): Record<string, T.RuleKey[]> {
  const byProperty: Record<string, T.RuleKey[]> = {}
  for (const ruleKey of projectRules(rulesFile, requestType, subjects, on)) {
    for (const property of planFacts(rulesFile, [ruleKey], requestType).properties) {
      byProperty[property.key] = [...(byProperty[property.key] ?? []), ruleKey]
    }
  }
  return byProperty
}

/**
 * The full definition for a project of these subjects: a group for the work and one per subject, each asking every
 * property the rules test of it that a homeowner can state, worded by code (`fallbackQuestion`) and citing the
 * provisions of the rules that read it, and every document the rules require. A property no rule checks at application
 * reads (only permissions, the exemptions the association grants, or deadlines after approval read it) is usually known
 * by the association: it's kept aside, for an administrator to add.
 */
export function buildDefinition(
  rulesFile: T.RulesFile,
  requestType: T.TermKey,
  subjects: readonly T.TermKey[],
  on: T.IsoDate
): ProjectTypeDefinition {
  const vocabulary = rulebookVocabulary(rulesFile)
  const units = unitLabels(rulesFile, vocabulary)
  const selected = projectRules(rulesFile, requestType, subjects, on)
  const plan = planFacts(rulesFile, selected, requestType)
  const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
  const byProperty = Object.entries(propertyRules(rulesFile, requestType, subjects, on))
  // A norm checks the application unless it's a permission (an exemption) or a deadline after approval; one with no
  // check (a prohibition) is decided by its condition, so what the condition reads is checked too.
  const isApplicationCheck = (key: T.RuleKey) => {
    const rule = rules.get(key)
    return rule?.kind === "norm" && rule.modality !== "permission" && rule.check?.type !== "deadline"
  }
  const checked = new Set(
    byProperty.filter(([, ruleKeys]) => ruleKeys.some(isApplicationCheck)).map(([property]) => property)
  )
  const citations = new Map(
    byProperty.map(([property, ruleKeys]) => [
      property,
      [...new Set(ruleKeys.flatMap((key) => rules.get(key)?.citations.map((citation) => citation.provisionKey) ?? []))]
    ])
  )
  const groupFor = (subject: T.TermKey): ProjectGroup => {
    const isWork = subject === workType
    const context = { vocabulary, units, subject: isWork ? "project" : vocabulary.label(subject), citations, checked }
    return {
      subject,
      label: isWork ? "The project" : sentenceCase(vocabulary.label(subject, true)),
      itemLabel: isWork ? "The project" : sentenceCase(vocabulary.label(subject)),
      help: isWork ? null : helpOf(definitionOf(vocabulary, subject)),
      isRepeatable: !isWork,
      fields: plan.properties
        .filter((property) => property.owner === subject)
        .flatMap((property) => fieldOf(property, context) ?? [])
    }
  }
  return askApplicants({
    subjects: [...subjects],
    groups: [workType, ...subjects].map(groupFor).filter((group) => group.fields.length > 0),
    ...documentsOf(rulesFile, new Set(selected), vocabulary),
    unasked: []
  })
}

/** "fence run" from "Fence run", "project" for the work: the subject as code's questions name it. */
const sectionName = (group: ProjectGroup) =>
  group.subject === workType ? "project" : group.itemLabel.charAt(0).toLowerCase() + group.itemLabel.slice(1)

/**
 * A bound question as the administrator worded it, typed by the rules: its wording, example, citations, who answers
 * it and whether it's required are theirs; for a choice, so are the listed values to offer. A label that's only the
 * detail's name reads as code's question.
 */
function boundField(field: ProjectField, bound: ProjectField, section: ProjectGroup): ProjectField {
  const isName =
    !field.label.endsWith("?") && fallbackQuestion(field.label, bound.kind, sectionName(section)) === bound.label
  const wording = {
    label: isName ? bound.label : field.label,
    help: field.help,
    example: field.example,
    isRequired: field.isRequired,
    answeredBy: bound.answeredBy,
    citations: field.citations ?? bound.citations
  }
  if (bound.kind !== "choice" || field.kind !== "choice") {
    return { ...bound, ...wording }
  }
  const offered = new Set(field.options.map((option) => option.value))
  const options = bound.options.filter((option) => offered.has(option.value))
  return { ...bound, ...wording, options: options.length > 0 ? options : bound.options }
}

/**
 * A definition checked against the full one the rules give for its subjects. A bound question must be one the rules
 * ask (its kind, unit and listed values come from the vocabulary; its wording, citations, which values to offer,
 * whether it's required and its place in the form are the administrator's); a bound question the rules don't ask is
 * dropped. The administrator's own questions are kept as they wrote them. Every document must be one the rules require
 * (what it must show and the rules come from the rules; its label, whether it's required and its place are the
 * administrator's). Every question the rules ask that the form doesn't is kept aside, with its wording where it had
 * one.
 */
export function bindDefinition(definition: ProjectTypeDefinition, built: ProjectTypeDefinition): ProjectTypeDefinition {
  const key = (subject: string, property: string) => `${subject} ${property}`
  const asked = new Set<string>()
  const groups = definition.groups.flatMap((group) => {
    const rules = built.groups.find((item) => item.subject === group.subject)
    const ruleQuestion = (property: string | null) =>
      allQuestions(built).find((item) => item.subject === group.subject && item.field.property === property)?.field
    // A section whose questions the rules ask are all aside keeps the administrator's own heading.
    const section = rules ?? (group.subject === workType ? projectSection() : group)
    const fields = group.fields.flatMap((field) => {
      const id = key(group.subject, field.property)
      if (asked.has(id)) {
        return []
      }
      if (field.binding === null) {
        asked.add(id)
        return [field]
      }
      const bound = ruleQuestion(field.binding)
      if (!bound) {
        return []
      }
      asked.add(id)
      return [boundField(field, bound, section)]
    })
    return fields.length > 0 ? [{ ...section, label: group.label, itemLabel: group.itemLabel, fields }] : []
  })
  const worded = new Map(allQuestions(definition).map((item) => [key(item.subject, item.field.property), item.field]))
  const unasked = allQuestions(built).flatMap((item) => {
    if (asked.has(key(item.subject, item.field.property))) {
      return []
    }
    const own = worded.get(key(item.subject, item.field.property))
    const section = built.groups.find((group) => group.subject === item.subject) ?? projectSection()
    return [{ subject: item.subject, field: own ? boundField(own, item.field, section) : item.field }]
  })
  const documents = definition.documents.flatMap((document) => {
    const bound = built.documents.find((item) => item.documentType === document.documentType)
    if (bound) {
      return [{ ...bound, label: document.label, isRequired: document.isRequired, accepts: document.accepts }]
    }
    // The administrator's own document requirement is kept as they wrote it.
    return document.ruleKeys.length === 0 && document.documentType.startsWith("custom.") ? [document] : []
  })
  return {
    subjects: built.subjects,
    groups,
    documents: [...new Map(documents.map((document) => [document.documentType, document])).values()],
    // What the form provides follows the rules alone.
    formDocuments: built.formDocuments,
    unasked
  }
}
