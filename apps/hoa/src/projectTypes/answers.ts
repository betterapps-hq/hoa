import { z } from "zod"
import { normalizeForMatching } from "@/ocr/page"
import type { FactAnswer } from "@/review/factSchema"
import type { Packet, PacketFile } from "@/review/packet"
import type * as T from "@/schema/types"
import type { AnswerValue, ProjectAnswers, ProjectField, ProjectGroup, ProjectTypeDefinition } from "./projectType"

// The homeowner's answers to a project type's form (application-review.md, Project types): validated with a Zod
// schema built from the definition, shown to the review's models (and the committee) as one more page of the packet,
// every answer included, and, where a group describes exactly one entity (the work), the answers to bound questions
// read as facts of their properties. The administrator's own questions are context only.

/** The file id of the answers page in the packet. */
export const answersFileId = "form-answers"

const isBlank = (value: AnswerValue | undefined) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)

/** The schema for one answer: its kind's value, and an answer when the question is required. */
export function fieldSchema(field: ProjectField) {
  const required = (schema: z.ZodType<AnswerValue>) =>
    field.isRequired ? schema.refine((value) => !isBlank(value), { message: "Answer this question." }) : schema
  switch (field.kind) {
    case "number":
      // A box the form couldn't read stays text, so it fails here with how to fix it.
      return required(
        z.union([z.number().nonnegative("Give an amount that isn't negative."), z.literal(""), z.null()], {
          error: () => "Use numbers only, such as 6 or 5.5."
        })
      )
    case "choices": {
      const values = field.options.map((option) => option.value)
      return required(z.union([z.array(z.enum(values)), z.null()]))
    }
    case "yes-no":
      return required(z.union([z.boolean(), z.null()]))
    case "choice":
      return required(
        field.allowsOther
          ? z.union([z.string(), z.null()])
          : z.union([z.enum(field.options.map((option) => option.value)), z.literal(""), z.null()])
      )
    case "date":
      return required(z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date."), z.literal(""), z.null()]))
    case "time":
      return required(z.union([z.string().regex(/^\d{2}:\d{2}$/, "Give a time."), z.literal(""), z.null()]))
    default:
      return required(z.union([z.string().max(4000), z.null()]))
  }
}

/** What's wrong with one answer, in words; empty when it's fine. */
export function answerErrors(field: ProjectField, value: AnswerValue | undefined): string[] {
  const parsed = fieldSchema(field).safeParse(value ?? null)
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.message))]
}

/** The Zod schema for a definition's answers: each group's items, each field's value. */
export function answersSchema(definition: ProjectTypeDefinition) {
  return z.object(
    Object.fromEntries(
      definition.groups.map((group) => [
        group.subject,
        z
          .array(
            z.object(Object.fromEntries(group.fields.map((field) => [field.property, fieldSchema(field).optional()])))
          )
          .min(1)
          .max(group.isRepeatable ? 50 : 1)
      ])
    )
  )
}

/** Empty answers: one blank item per group. */
export const emptyAnswers = (definition: ProjectTypeDefinition): ProjectAnswers =>
  Object.fromEntries(definition.groups.map((group) => [group.subject, [blankItem(group)]]))

export const blankItem = (group: ProjectGroup): Record<string, AnswerValue> =>
  Object.fromEntries(group.fields.map((field) => [field.property, null]))

/** An answer in words, as the homeowner gave it. */
function answerText(field: ProjectField, value: AnswerValue): string | null {
  if (isBlank(value)) {
    return null
  }
  if (field.kind === "yes-no") {
    return value ? "Yes" : "No"
  }
  if (field.kind === "number") {
    return field.unit ? `${String(value)} ${field.unit.label}` : String(value)
  }
  if (field.kind === "choice") {
    return field.options.find((option) => option.value === value)?.label ?? String(value)
  }
  if (Array.isArray(value)) {
    const labels = value.map((item) =>
      field.kind === "choices" ? (field.options.find((option) => option.value === item)?.label ?? item) : item
    )
    return labels.join("; ")
  }
  return String(value)
}

const itemName = (group: ProjectGroup, index: number) =>
  group.isRepeatable ? `${group.itemLabel} ${index + 1}` : group.itemLabel

/** The answers as lines of text, "Question? Answer" (or "Label: answer"), under each item's name. */
export function answerLines(definition: ProjectTypeDefinition, answers: ProjectAnswers) {
  return definition.groups.flatMap((group) =>
    (answers[group.subject] ?? []).flatMap((item, index) => {
      const lines = group.fields.flatMap((field) => {
        const text = answerText(field, item[field.property] ?? null)
        return text === null
          ? []
          : [{ field, index, line: `${field.label}${/[?:]$/.test(field.label) ? "" : ":"} ${text}` }]
      })
      return lines.length > 0 ? [{ group, index, heading: itemName(group, index), lines }] : []
    })
  )
}

/**
 * The answers as a page of the packet, so every stage reads them like the homeowner's other pages and cites them as
 * evidence: the project type, then each item's answers.
 */
export function withAnswersPage(
  packet: Packet,
  input: { projectType: string | null; definition: ProjectTypeDefinition | null; answers: ProjectAnswers | null }
): Packet {
  const sections = input.definition && input.answers ? answerLines(input.definition, input.answers) : []
  if (sections.length === 0) {
    return packet
  }
  const text = [
    "ANSWERS GIVEN IN THE APPLICATION FORM",
    ...(input.projectType ? [`Project type: ${input.projectType}`] : []),
    ...sections.flatMap((section) => [section.heading, ...section.lines.map((item) => item.line)])
  ].join("\n")
  const file: PacketFile = {
    id: answersFileId,
    fileName: "Application form answers",
    mediaType: "text/plain",
    contextText: null,
    isReadable: true,
    pages: [
      {
        documentId: answersFileId,
        pageIndex: 1,
        pageLabel: null,
        labelSource: null,
        engine: "form",
        optionsHash: "form",
        text,
        normalizedText: normalizeForMatching(text),
        header: null,
        footer: null,
        headings: [],
        sectionAtTop: null,
        checkboxes: [],
        figures: [],
        minConfidence: null,
        lowConfidenceSpans: []
      }
    ],
    visuals: []
  }
  return { ...packet, files: [file, ...packet.files] }
}

/**
 * The answers about a group that describes one entity (the work), as readings of their properties: the homeowner
 * stated them in the form, which the answers page records. Repeated items are left to the models, which match them to
 * the entities they name.
 */
export function answerReadings(
  definition: ProjectTypeDefinition | null,
  answers: ProjectAnswers | null,
  entities: readonly { id: string; type: T.TermKey }[],
  thingOf: (key: T.TermKey) => T.TermKey
): FactAnswer[] {
  if (!definition || !answers) {
    return []
  }
  return answerLines(definition, answers).flatMap((section) => {
    const matching = entities.filter((entity) => thingOf(entity.type) === section.group.subject)
    const [entity] = matching
    if (section.group.isRepeatable || matching.length !== 1 || !entity) {
      return []
    }
    // Only bound questions are facts; the administrator's own are context on the answers page.
    return section.lines.flatMap(({ field, line }) => {
      const value = answers[section.group.subject]?.[section.index]?.[field.property] ?? null
      if (field.binding === null || Array.isArray(value)) {
        return []
      }
      return {
        entity: entity.id,
        property: field.binding,
        state: "known" as const,
        stated: answerText(field, value),
        reading: field.kind === "number" && field.unit ? { value, unit: field.unit.key } : value,
        evidence: [{ fileId: answersFileId, page: 1, quote: line }],
        confidence: 0.95
      }
    })
  })
}
