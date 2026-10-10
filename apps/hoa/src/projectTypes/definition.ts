import { workType } from "@/review/subjects"
import type { ProjectDocument, ProjectField, ProjectGroup, ProjectTypeDefinition, UnaskedField } from "./projectType"

// Editing a project type's definition (application-review.md, Project types): the administrator's moves, edits,
// removals and additions, as pure functions over the definition. The order of sections, questions and documents is the
// order homeowners see. A removed question the rules ask is kept aside with its wording, so adding it back keeps it.

/** The section for the work as a whole, where the administrator's own questions about the project go. */
export const projectSection = (): ProjectGroup => ({
  subject: workType,
  label: "The project",
  itemLabel: "The project",
  help: null,
  isRepeatable: false,
  fields: []
})

const keyOf = (subject: string, property: string) => `${subject} ${property}`

/** Every question a definition holds, asked or kept aside, with its subject. */
export function allQuestions(definition: ProjectTypeDefinition): UnaskedField[] {
  return [
    ...definition.groups.flatMap((group) => group.fields.map((field) => ({ subject: group.subject, field }))),
    ...definition.unasked
  ]
}

/** Moves the questions only the association usually knows out of the form, keeping them to add back. */
export function askApplicants(definition: ProjectTypeDefinition): ProjectTypeDefinition {
  const aside = definition.groups.flatMap((group) =>
    group.fields
      .filter((field) => field.answeredBy === "association")
      .map((field) => ({ subject: group.subject, field }))
  )
  return {
    ...definition,
    groups: definition.groups
      .map((group) => ({ ...group, fields: group.fields.filter((field) => field.answeredBy === "applicant") }))
      .filter((group) => group.fields.length > 0),
    unasked: [...definition.unasked, ...aside]
  }
}

/** The list with one item moved from one place to another. */
export function moveItem<Item>(items: readonly Item[], from: number, to: number): Item[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined || to < 0 || to > items.length - 1) {
    return [...items]
  }
  next.splice(to, 0, moved)
  return next
}

const withFields = (
  definition: ProjectTypeDefinition,
  subject: string,
  change: (fields: ProjectField[]) => ProjectField[]
): ProjectTypeDefinition => ({
  ...definition,
  groups: definition.groups
    .map((group) => (group.subject === subject ? { ...group, fields: change(group.fields) } : group))
    .filter((group) => group.fields.length > 0)
})

export function moveQuestion(definition: ProjectTypeDefinition, subject: string, from: number, to: number) {
  return withFields(definition, subject, (fields) => moveItem(fields, from, to))
}

export function updateQuestion(definition: ProjectTypeDefinition, subject: string, field: ProjectField) {
  return withFields(definition, subject, (fields) =>
    fields.map((item) => (item.property === field.property ? field : item))
  )
}

/** Takes a question out of the form; one the rules ask stays aside with its wording. */
export function removeQuestion(definition: ProjectTypeDefinition, subject: string, property: string) {
  const field = definition.groups
    .find((group) => group.subject === subject)
    ?.fields.find((item) => item.property === property)
  if (!field) {
    return definition
  }
  const removed = withFields(definition, subject, (fields) => fields.filter((item) => item.property !== property))
  return field.binding === null ? removed : { ...removed, unasked: [{ subject, field }, ...removed.unasked] }
}

/**
 * Puts a question in the form, at a place in its section (the end by default). A section the form doesn't have yet
 * comes back where the rules put it among the others.
 */
export function addQuestion(
  definition: ProjectTypeDefinition,
  available: ProjectTypeDefinition,
  subject: string,
  field: ProjectField,
  at?: number
): ProjectTypeDefinition {
  const unasked = definition.unasked.filter(
    (item) => keyOf(item.subject, item.field.property) !== keyOf(subject, field.property)
  )
  const existing = definition.groups.find((group) => group.subject === subject)
  if (existing) {
    const fields = existing.fields.filter((item) => item.property !== field.property)
    const index = at ?? fields.length
    return {
      ...withFields(definition, subject, () => [...fields.slice(0, index), field, ...fields.slice(index)]),
      unasked
    }
  }
  const section =
    available.groups.find((group) => group.subject === subject) ?? (subject === workType ? projectSection() : undefined)
  if (!section) {
    return definition
  }
  const order = [workType, ...available.groups.map((group) => group.subject).filter((item) => item !== workType)]
  const rank = (group: ProjectGroup) => {
    const index = order.indexOf(group.subject)
    return index === -1 ? order.length : index
  }
  const group: ProjectGroup = { ...section, fields: [field] }
  const after = definition.groups.filter((item) => rank(item) <= rank(group)).length
  return {
    ...definition,
    groups: [...definition.groups.slice(0, after), group, ...definition.groups.slice(after)],
    unasked
  }
}

export type Candidate = UnaskedField & { section: string }

/**
 * The questions the rules can ask that the form doesn't, with their wording where the definition kept it, in the
 * rules' order: what "Add question" offers.
 */
export function candidateQuestions(definition: ProjectTypeDefinition, available: ProjectTypeDefinition): Candidate[] {
  const asked = new Set(
    allQuestions({ ...definition, unasked: [] }).map((item) => keyOf(item.subject, item.field.property))
  )
  const kept = new Map(definition.unasked.map((item) => [keyOf(item.subject, item.field.property), item.field]))
  const sections = new Map(available.groups.map((group) => [group.subject, group.label]))
  return allQuestions(available).flatMap((item) => {
    const key = keyOf(item.subject, item.field.property)
    if (asked.has(key)) {
      return []
    }
    const own = kept.get(key)
    const field = own ? { ...own, answeredBy: item.field.answeredBy } : item.field
    return [{ subject: item.subject, field, section: sections.get(item.subject) ?? item.subject }]
  })
}

const withDocuments = (definition: ProjectTypeDefinition, documents: ProjectDocument[]): ProjectTypeDefinition => ({
  ...definition,
  documents
})

export const moveDocument = (definition: ProjectTypeDefinition, from: number, to: number) =>
  withDocuments(definition, moveItem(definition.documents, from, to))

export const updateDocument = (definition: ProjectTypeDefinition, document: ProjectDocument) =>
  withDocuments(
    definition,
    definition.documents.map((item) => (item.documentType === document.documentType ? document : item))
  )

export const removeDocument = (definition: ProjectTypeDefinition, documentType: string) =>
  withDocuments(
    definition,
    definition.documents.filter((item) => item.documentType !== documentType)
  )

export function addDocument(definition: ProjectTypeDefinition, document: ProjectDocument, at?: number) {
  const documents = definition.documents.filter((item) => item.documentType !== document.documentType)
  const index = at ?? documents.length
  return withDocuments(definition, [...documents.slice(0, index), document, ...documents.slice(index)])
}

/** The sections a question can go in: the form's, those the rules ask about, and the project as a whole. */
export function sectionsOf(definition: ProjectTypeDefinition, available: ProjectTypeDefinition): ProjectGroup[] {
  const all = [projectSection(), ...available.groups, ...definition.groups]
  return [...new Map(all.map((group) => [group.subject, { ...group, fields: [] }])).values()]
}

/** A key for one of the administrator's own questions or documents, unique in the form. */
export function customKey(definition: ProjectTypeDefinition, label: string) {
  const slug =
    label
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, 40) || "question"
  const taken = new Set([
    ...allQuestions(definition).map((item) => item.field.property),
    ...definition.documents.map((document) => document.documentType)
  ])
  let key = `custom.${slug}`
  for (let count = 2; taken.has(key); count += 1) {
    key = `custom.${slug}-${count}`
  }
  return key
}

/** The documents the rules require that the form doesn't list. */
export const candidateDocuments = (definition: ProjectTypeDefinition, available: ProjectTypeDefinition) =>
  available.documents.filter(
    (document) => !definition.documents.some((item) => item.documentType === document.documentType)
  )

type ChoiceOption = Extract<ProjectField, { kind: "choice" }>["options"][number]

/**
 * One line of a bound choice question's list as the administrator edits it: a value from the rulebook's list, shown
 * or hidden, or one of their own (`isAdded`), whose value is empty until it's saved.
 */
export type ChoiceRow = { id: string; value: string; label: string; isAdded: boolean; isOffered: boolean }

/** A bound choice's list to edit: what it offers, in its order, then the rulebook's values it hides. */
export function choiceRows(options: readonly ChoiceOption[], listed: readonly ChoiceOption[]): ChoiceRow[] {
  const offered = new Set(options.map((option) => option.value))
  return [
    ...options.map((option) => ({ ...option, id: option.value, isOffered: true })),
    ...listed
      .filter((option) => !offered.has(option.value))
      .map((option) => ({ ...option, id: option.value, isAdded: false, isOffered: false }))
  ]
}

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** What's wrong with an edited list, in words: nothing offered, or an added choice that repeats another. */
export function choiceErrors(rows: readonly ChoiceRow[], listed: readonly ChoiceOption[]): string[] {
  const added = rows.filter((row) => row.isAdded && row.label.trim() !== "")
  const errors = rows.some((row) => row.isOffered && row.label.trim() !== "") ? [] : ["Offer at least one choice."]
  for (const [index, row] of added.entries()) {
    const listedAs = listed.find((option) => sameWords(option.label, row.label))
    if (listedAs) {
      errors.push(`The rulebook's list has “${listedAs.label}”: show it instead of adding it.`)
    } else if (added.slice(0, index).some((other) => sameWords(other.label, row.label))) {
      errors.push(`“${row.label.trim()}” is on the list twice.`)
    }
  }
  return errors
}

/**
 * The options an edited list offers, in its order. An added choice keeps its value when renamed; a new one gets a key
 * made from its label, unique among the property's values. A blank added choice is left out.
 */
export function offeredChoices(rows: readonly ChoiceRow[], listed: readonly ChoiceOption[]): ChoiceOption[] {
  const taken = new Set([...listed.map((option) => option.value), ...rows.map((row) => row.value).filter(Boolean)])
  return rows.flatMap((row) => {
    const label = row.label.trim()
    if (!row.isOffered || label === "") {
      return []
    }
    if (!row.isAdded || row.value !== "") {
      return [{ value: row.value, label, isAdded: row.isAdded }]
    }
    const slug =
      label
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "")
        .slice(0, 40) || "choice"
    let value = slug
    for (let count = 2; taken.has(value); count += 1) {
      value = `${slug}-${count}`
    }
    taken.add(value)
    return [{ value, label, isAdded: true }]
  })
}

/** What a screen reader hears after a move: "Moved “Height” to position 3 of 12." */
export const movedText = (name: string, index: number, total: number) =>
  `Moved “${name}” to position ${index + 1} of ${total}.`
