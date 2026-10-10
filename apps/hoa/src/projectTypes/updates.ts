import { bindDefinition } from "./bind"
import { addDocument, addQuestion, allQuestions } from "./definition"
import type { ProjectDocument, ProjectField, ProjectTypeDefinition } from "./projectType"

// A project type against a newer rulebook (application-review.md, Project types, Out of date): what changed in the
// rules its form rests on, worked out by code from the form built against the rulebook it was made with and the one
// built against the published rulebook, and the form that results from accepting some changes and keeping the
// administrator's version of the rest. The administrator's own edits (their questions and documents, wording, added
// choices, order, required flags, citations) survive either way.

export type RulebookChange = {
  /** Unique within the list, stable for the same forms. */
  id: string
  kind:
    | "question-new"
    | "question-gone"
    | "question-changed"
    | "citation-gone"
    | "document-new"
    | "document-gone"
    | "document-changed"
  /** The question or document as the form names it. */
  label: string
  /** What changed, in a sentence. */
  detail: string
  /** The section a question is in, by subject; null for a document. */
  subject: string | null
  /** The question's property, or the document's type. */
  key: string
  /** The cited passages the rulebook no longer has, for a citation change. */
  missing?: string[]
}

const answerTypeNames: Record<ProjectField["kind"], string> = {
  text: "short text",
  "long-text": "long text",
  number: "an amount",
  choice: "one choice",
  choices: "several choices",
  "yes-no": "yes or no",
  date: "a date",
  time: "a time of day"
}

function typeName(field: ProjectField) {
  if (field.kind !== "number") {
    return answerTypeNames[field.kind]
  }
  return field.unit ? `an amount in ${field.unit.label}` : "a count"
}

const quoted = (labels: readonly string[]) => labels.map((label) => `“${label}”`).join(", ")

/** How a detail's question differs between two rulebooks, in a sentence; null when it doesn't. */
function fieldChange(before: ProjectField, after: ProjectField): string | null {
  if (typeName(before) !== typeName(after)) {
    return `Its answer is now ${typeName(after)}, not ${typeName(before)}.`
  }
  if (before.kind !== "choice" || after.kind !== "choice") {
    return null
  }
  const added = after.options.filter((option) => !before.options.some((item) => item.value === option.value))
  const dropped = before.options.filter((option) => !after.options.some((item) => item.value === option.value))
  const parts = [
    added.length > 0 ? `adds ${quoted(added.map((option) => option.label))}` : null,
    dropped.length > 0 ? `drops ${quoted(dropped.map((option) => option.label))}` : null
  ].filter((part) => part !== null)
  return parts.length > 0 ? `The rulebook's list ${parts.join(" and ")}.` : null
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item))

/**
 * What changed for a form between the rulebook it was built against (`previous`, that rulebook's own form; null when
 * it's gone, so only what the stored form shows can be compared) and the published one (`latest`): questions and
 * documents the rules now ask for or no longer do, answers and choices that changed, and cited passages the rulebook
 * no longer has (`provisions`: every passage the published rulebook has).
 */
export function rulebookChanges(
  stored: ProjectTypeDefinition,
  previous: ProjectTypeDefinition | null,
  latest: ProjectTypeDefinition,
  provisions: ReadonlySet<string>
): RulebookChange[] {
  const find = (definition: ProjectTypeDefinition | null, subject: string, property: string | null) =>
    definition
      ? allQuestions(definition).find((item) => item.subject === subject && item.field.property === property)?.field
      : undefined
  const changes: RulebookChange[] = []
  for (const group of stored.groups) {
    for (const field of group.fields) {
      const base = { label: field.label, subject: group.subject, key: field.property }
      if (field.binding !== null) {
        const before = find(previous, group.subject, field.binding) ?? field
        const after = find(latest, group.subject, field.binding)
        if (!after) {
          changes.push({
            ...base,
            id: `question-gone ${group.subject} ${field.property}`,
            kind: "question-gone",
            detail: "The rules no longer ask this."
          })
        } else {
          const detail = fieldChange(before, after)
          const ownNowListed =
            field.kind === "choice" && after.kind === "choice"
              ? field.options.filter(
                  (option) =>
                    option.isAdded &&
                    after.options.some((item) => item.label.trim().toLowerCase() === option.label.trim().toLowerCase())
                )
              : []
          const conflict =
            ownNowListed.length > 0
              ? `Your added ${quoted(ownNowListed.map((option) => option.label))} ${ownNowListed.length === 1 ? "is" : "are"} now on the rulebook's list.`
              : null
          if (detail || conflict) {
            changes.push({
              ...base,
              id: `question-changed ${group.subject} ${field.property}`,
              kind: "question-changed",
              detail: [detail, conflict].filter(Boolean).join(" ")
            })
          }
        }
      }
      const gone = (field.citations ?? []).filter((key) => !provisions.has(key))
      if (gone.length > 0) {
        changes.push({
          ...base,
          id: `citation-gone ${group.subject} ${field.property}`,
          kind: "citation-gone",
          missing: gone,
          detail:
            gone.length === 1
              ? "It cites a passage the rulebook no longer has."
              : `It cites ${gone.length} passages the rulebook no longer has.`
        })
      }
    }
  }
  const known = new Set(
    allQuestions(stored).map((item) => `${item.subject} ${item.field.binding ?? item.field.property}`)
  )
  const before = new Set(previous ? allQuestions(previous).map((item) => `${item.subject} ${item.field.property}`) : [])
  for (const group of latest.groups) {
    for (const field of group.fields) {
      const id = `${group.subject} ${field.property}`
      if (!known.has(id) && (previous === null || !before.has(id))) {
        changes.push({
          id: `question-new ${id}`,
          kind: "question-new",
          label: field.label,
          detail: "The rules now ask this.",
          subject: group.subject,
          key: field.property
        })
      }
    }
  }
  for (const document of stored.documents.filter((item) => item.ruleKeys.length > 0)) {
    const base = { label: document.label, subject: null, key: document.documentType }
    const after = latest.documents.find((item) => item.documentType === document.documentType)
    const priorShows = previous?.documents.find((item) => item.documentType === document.documentType)?.mustShow
    if (!after) {
      changes.push({
        ...base,
        id: `document-gone ${document.documentType}`,
        kind: "document-gone",
        detail: "The rules no longer require it."
      })
    } else if (!sameList(priorShows ?? document.mustShow, after.mustShow)) {
      changes.push({
        ...base,
        id: `document-changed ${document.documentType}`,
        kind: "document-changed",
        detail:
          after.mustShow.length > 0
            ? `It must now show: ${after.mustShow.join("; ")}.`
            : "It no longer must show anything."
      })
    }
  }
  for (const document of latest.documents) {
    const isKnown =
      stored.documents.some((item) => item.documentType === document.documentType) ||
      (previous?.documents.some((item) => item.documentType === document.documentType) ?? false)
    if (!isKnown) {
      changes.push({
        id: `document-new ${document.documentType}`,
        kind: "document-new",
        label: document.label,
        detail: "The rules now require it.",
        subject: null,
        key: document.documentType
      })
    }
  }
  return changes
}

const withField = (
  definition: ProjectTypeDefinition,
  subject: string | null,
  property: string,
  change: (field: ProjectField) => ProjectField | null
): ProjectTypeDefinition => ({
  ...definition,
  groups: definition.groups
    .map((group) =>
      group.subject === subject
        ? {
            ...group,
            fields: group.fields.flatMap((field) => {
              if (field.property !== property) {
                return [field]
              }
              const next = change(field)
              return next ? [next] : []
            })
          }
        : group
    )
    .filter((group) => group.fields.length > 0)
})

/** A document requirement the administrator keeps as their own, which the rules no longer shape. */
const ownDocument = (document: ProjectDocument): ProjectDocument => ({
  ...document,
  documentType: document.documentType.startsWith("custom.") ? document.documentType : `custom.${document.documentType}`,
  ruleKeys: []
})

/**
 * The form with the accepted changes taken from the published rulebook and the administrator's version kept for the
 * rest, bound against the published rulebook. Kept, a question the rules changed or no longer ask stays as the
 * administrator worded it (their citations still decide what it's checked against), a document stays as their own,
 * a missing passage stays cited, and a question or document the rules now ask for stays out of the form, offered by
 * Add question or Add document.
 */
export function applyChanges(
  stored: ProjectTypeDefinition,
  latest: ProjectTypeDefinition,
  changes: readonly RulebookChange[],
  accepted: ReadonlySet<string>
): ProjectTypeDefinition {
  const merged = bindDefinition(stored, latest)
  const mergedField = (subject: string | null, field: ProjectField) =>
    merged.groups
      .find((group) => group.subject === subject)
      ?.fields.find((item) => item.property === field.binding || item.property === field.property)
  let next = stored
  for (const change of changes) {
    const isAccepted = accepted.has(change.id)
    switch (change.kind) {
      case "question-gone":
        next = withField(next, change.subject, change.key, (field) => (isAccepted ? null : { ...field, binding: null }))
        break
      case "question-changed":
        next = withField(next, change.subject, change.key, (field) =>
          isAccepted ? (mergedField(change.subject, field) ?? field) : { ...field, binding: null }
        )
        break
      case "citation-gone":
        next = isAccepted
          ? withField(next, change.subject, change.key, (field) => ({
              ...field,
              citations: (field.citations ?? []).filter((key) => !(change.missing ?? []).includes(key))
            }))
          : next
        break
      case "question-new": {
        const field = allQuestions(latest).find(
          (item) => item.subject === change.subject && item.field.property === change.key
        )?.field
        next = isAccepted && field && change.subject ? addQuestion(next, latest, change.subject, field) : next
        break
      }
      case "document-gone":
      case "document-changed":
        next = {
          ...next,
          documents: next.documents.flatMap((document) => {
            if (document.documentType !== change.key) {
              return [document]
            }
            if (!isAccepted) {
              return [ownDocument(document)]
            }
            const after = latest.documents.find((item) => item.documentType === change.key)
            return after
              ? [{ ...after, label: document.label, isRequired: document.isRequired, accepts: document.accepts }]
              : []
          })
        }
        break
      case "document-new": {
        const document = latest.documents.find((item) => item.documentType === change.key)
        next = isAccepted && document ? addDocument(next, document) : next
        break
      }
    }
  }
  return bindDefinition(next, latest)
}
