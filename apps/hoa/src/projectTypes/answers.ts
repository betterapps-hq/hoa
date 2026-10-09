import { z } from "zod"
import { normalizeForMatching } from "@/ocr/page"
import type { FactAnswer } from "@/review/factSchema"
import type { Packet, PacketFile } from "@/review/packet"
import type * as T from "@/schema/types"
import type { AnswerValue, ProjectAnswers, ProjectField, ProjectGroup, ProjectTypeDefinition } from "./projectType"

// The homeowner's answers to a project type's form (application-review.md, Project types): validated with a Zod
// schema built from the definition, shown to the review's models as one more page of the packet, and, where a group
// describes exactly one entity (the work), read as facts of the properties its fields bind to.

/** The file id of the answers page in the packet. */
export const answersFileId = "form-answers"

const isBlank = (value: AnswerValue | undefined) => value === null || value === undefined || value === ""

function fieldSchema(field: ProjectField) {
  const required = (schema: z.ZodType<AnswerValue>) =>
    field.isRequired ? schema.refine((value) => !isBlank(value), { message: `Answer "${field.label}".` }) : schema
  switch (field.kind) {
    case "number":
      return required(z.union([z.number().nonnegative(`"${field.label}" can't be negative.`), z.literal(""), z.null()]))
    case "yes-no":
      return required(z.union([z.boolean(), z.null()]))
    case "choice":
      return required(
        field.allowsOther
          ? z.union([z.string(), z.null()])
          : z.union([z.enum(field.options.map((option) => option.value)), z.literal(""), z.null()])
      )
    case "date":
      return required(
        z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Give "${field.label}" as a date.`), z.literal(""), z.null()])
      )
    default:
      return required(z.union([z.string().max(4000), z.null()]))
  }
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
  return String(value)
}

const itemName = (group: ProjectGroup, index: number) =>
  group.isRepeatable ? `${group.itemLabel} ${index + 1}` : group.itemLabel

/** The answers as lines of text, "Label: answer", under each item's name. */
export function answerLines(definition: ProjectTypeDefinition, answers: ProjectAnswers) {
  return definition.groups.flatMap((group) =>
    (answers[group.subject] ?? []).flatMap((item, index) => {
      const lines = group.fields.flatMap((field) => {
        const text = answerText(field, item[field.property] ?? null)
        return text === null ? [] : [{ field, index, line: `${field.label}: ${text}` }]
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
    return section.lines.map(({ field, line }) => {
      const value = answers[section.group.subject]?.[section.index]?.[field.property] ?? null
      return {
        entity: entity.id,
        property: field.property,
        state: "known" as const,
        stated: answerText(field, value),
        reading: field.kind === "number" && field.unit ? { value, unit: field.unit.key } : value,
        evidence: [{ fileId: answersFileId, page: 1, quote: line }],
        confidence: 0.95
      }
    })
  })
}
