import { workType } from "@/review/subjects"
import { allQuestions, projectSection } from "./definition"
import type { ProjectField, ProjectGroup, ProjectTypeDefinition } from "./projectType"
import { fallbackQuestion } from "./wording"

// Binding a project type's questions to the details the rules test (application-review.md, Project types). A
// question's citations are what its answer is checked against: a question whose citations include a passage a rule
// states, and whose answer type can give the detail that rule tests, is bound to that detail, so its answer reaches the
// review as a fact; one whose citations no longer justify it is unbound, and its answer is context the review still
// reads. All of it is code's, run on every save, and nothing in the editor names it.

/** "fence run" from "Fence run", "project" for the work: the subject as code's questions name it. */
const sectionName = (group: ProjectGroup) =>
  group.subject === workType ? "project" : group.itemLabel.charAt(0).toLowerCase() + group.itemLabel.slice(1)

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A bound question as the administrator worded it, typed by the rules: its wording, example, citations, who answers
 * it and whether it's required are theirs; for a choice, so are which of the rulebook's values to offer, their own
 * added values, the order, and whether "Other" is offered. A label that's only the detail's name reads as code's
 * question.
 */
export function boundField(field: ProjectField, bound: ProjectField, section: ProjectGroup): ProjectField {
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
  // The administrator's order; the rulebook's values keep the rulebook's labels, and one it no longer has is dropped. An
  // added value the rulebook has since named (its value or its label) is the rulebook's.
  const listed = new Map(bound.options.map((option) => [option.value, option]))
  const options = field.options.flatMap((option) => {
    const value =
      listed.get(option.value) ??
      (option.isAdded ? bound.options.find((item) => sameWords(item.label, option.label)) : undefined)
    if (value) {
      return [value]
    }
    return option.isAdded ? [option] : []
  })
  return {
    ...bound,
    ...wording,
    options:
      options.length > 0 ? [...new Map(options.map((option) => [option.value, option])).values()] : bound.options,
    allowsOther: field.allowsOther
  }
}

/** A choice's options as values of a rules' detail: the same value or label is the rulebook's, the rest the administrator's own. */
function asListed(field: Extract<ProjectField, { kind: "choice" }>, bound: Extract<ProjectField, { kind: "choice" }>) {
  return field.options.map((option) => {
    const listed = bound.options.find((item) => item.value === option.value || sameWords(item.label, option.label))
    return listed ?? { ...option, isAdded: true }
  })
}

/**
 * Whether a question's answer can give a rules' detail: the same answer type, an amount of the same dimension, and
 * for a choice, at least one of its choices among the rulebook's values.
 */
function canAnswer(field: ProjectField, bound: ProjectField) {
  if (field.kind !== bound.kind) {
    return false
  }
  if (field.kind === "number" && bound.kind === "number") {
    return field.dimension === bound.dimension && (field.unit === null) === (bound.unit === null)
  }
  if (field.kind === "choice" && bound.kind === "choice") {
    return asListed(field, bound).some((option) => !option.isAdded)
  }
  return true
}

const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])

/** How closely a detail's question matches a question's wording: the words they share. */
function closeness(field: ProjectField, bound: ProjectField) {
  const words = wordsOf(`${field.label} ${field.help ?? ""}`)
  return [...wordsOf(bound.label)].filter((word) => words.has(word)).length
}

/**
 * A definition checked against the full one the rules give for its subjects. Each question's citations decide what it
 * answers: a bound question stays bound while its answer type fits and its citations still include a passage of the
 * rules that test its detail (or it cites the rules' own, or those rules cite nothing); any other question is bound to
 * a detail its citations' rules test that its answer type can give and no other question answers, the closest in
 * wording when several fit, and otherwise unbound. A bound question keeps the kind, unit and listed values the rules
 * give; its wording, citations, which values to offer, its own values, whether it's required and its place are the
 * administrator's. A bound question whose detail the rules no longer test is dropped. Every document must be one the
 * rules require (what it must show and the rules come from the rules; its label, whether it's required and its place
 * are the administrator's), or one of the administrator's own. Every question the rules ask that the form doesn't is
 * kept aside, with its wording where it had one.
 */
export function bindDefinition(definition: ProjectTypeDefinition, built: ProjectTypeDefinition): ProjectTypeDefinition {
  const key = (subject: string, property: string) => `${subject} ${property}`
  const ruleQuestions = (subject: string) =>
    allQuestions(built)
      .filter((item) => item.subject === subject)
      .map((item) => item.field)
  const ruleQuestion = (subject: string, property: string | null) =>
    ruleQuestions(subject).find((field) => field.property === property)
  const isCited = (citations: readonly string[] | null, bound: ProjectField) =>
    citations !== null && (bound.citations ?? []).some((cited) => citations.includes(cited))
  /** A bound question whose binding still holds. */
  const keepsBinding = (subject: string, field: ProjectField) => {
    const bound = ruleQuestion(subject, field.binding)
    return (
      bound !== undefined &&
      canAnswer(field, bound) &&
      (field.citations === null || (bound.citations ?? []).length === 0 || isCited(field.citations, bound))
    )
  }
  // Bindings that hold come first, so a question that could take another's detail never does.
  const taken = new Set(
    definition.groups.flatMap((group) =>
      group.fields.flatMap((field) =>
        field.binding !== null && keepsBinding(group.subject, field) ? [key(group.subject, field.binding)] : []
      )
    )
  )
  const asked = new Set<string>()
  const groups = definition.groups.flatMap((group) => {
    const rules = built.groups.find((item) => item.subject === group.subject)
    // A section whose questions the rules ask are all aside keeps the administrator's own heading.
    const section = rules ?? (group.subject === workType ? projectSection() : group)
    const bindTo = (field: ProjectField, bound: ProjectField) =>
      boundField(
        field.kind === "choice" && bound.kind === "choice" ? { ...field, options: asListed(field, bound) } : field,
        bound,
        section
      )
    const fields = group.fields.flatMap((field): ProjectField[] => {
      if (asked.has(key(group.subject, field.property))) {
        return []
      }
      if (field.binding !== null) {
        const bound = ruleQuestion(group.subject, field.binding)
        if (!bound) {
          return []
        }
        if (keepsBinding(group.subject, field)) {
          asked.add(key(group.subject, field.property))
          return [boundField(field, bound, section)]
        }
      }
      const fits = ruleQuestions(group.subject).filter(
        (bound) =>
          !taken.has(key(group.subject, bound.property)) && isCited(field.citations, bound) && canAnswer(field, bound)
      )
      const best = fits.reduce<ProjectField | null>(
        (chosen, bound) => (chosen === null || closeness(field, bound) > closeness(field, chosen) ? bound : chosen),
        null
      )
      if (best) {
        taken.add(key(group.subject, best.property))
        asked.add(key(group.subject, best.property))
        return [bindTo(field, best)]
      }
      asked.add(key(group.subject, field.property))
      return [{ ...field, binding: null }]
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
    return [
      {
        subject: item.subject,
        field: own && own.binding !== null ? boundField(own, item.field, section) : item.field
      }
    ]
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
