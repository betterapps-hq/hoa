import { z } from "zod"
import { moneyText } from "@/lib/text"
import { normalizeForMatching } from "@/ocr/page"
import { planFacts, type FactPlan } from "@/review/factPlan"
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

/** An answer of named parts: a signature's name and day, a contact's name, phone and email. */
export const isAnswerRecord = (value: AnswerValue | undefined): value is Record<string, string> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isBlank = (value: AnswerValue | undefined) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (isAnswerRecord(value) && Object.values(value).every((part) => part.trim() === ""))

/** A signature: the name the homeowner typed and the day they typed it. */
const signatureSchema = z.object({
  name: z.string().trim().min(1, "Type your full name to sign.").max(200, "Keep the name under 200 characters."),
  signedOn: z.iso.date()
})

/** A person's details: a name, and a phone or email to reach them by. */
const contactSchema = z.object({
  name: z.string().trim().min(1, "Give the person's name.").max(200, "Keep the name under 200 characters."),
  phone: z.string().max(40, "Keep the phone number under 40 characters."),
  email: z.union([z.literal(""), z.email("Give an email address such as name@example.com.")])
})

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
    case "signature":
      return required(z.union([signatureSchema, z.null()]))
    case "contact":
      return required(z.union([contactSchema, z.null()]))
    case "fee":
      // Confirming is the answer: a required fee must be confirmed, an optional one may be left.
      return field.isRequired
        ? z.literal(true, { error: () => "Confirm you'll pay this fee." })
        : z.union([z.literal(true), z.null()])
    default:
      return required(z.union([z.string().max(4000), z.null()]))
  }
}

/** What's wrong with one answer, in words; empty when it's fine. */
export function answerErrors(field: ProjectField, value: AnswerValue | undefined): string[] {
  const parsed = fieldSchema(field).safeParse(value ?? null)
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.message))]
}

/** The parts of a record answer (a contact's email) that are wrong; empty when the answer as a whole is. */
export function invalidParts(field: ProjectField, value: AnswerValue | undefined): ReadonlySet<string> {
  const parsed = fieldSchema(field).safeParse(value ?? null)
  return new Set(parsed.success ? [] : parsed.error.issues.flatMap((issue) => issue.path.slice(0, 1).map(String)))
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

/** Whether a question is answered once for every item of its section, which only a section that repeats has. */
export const isSharedIn = (group: ProjectGroup, field: ProjectField) => group.isRepeatable && field.isShared === true

/** Paying a fee and signing close a form: homeowners do them last, after everything they sign for. */
export const isClosing = (group: ProjectGroup, field: ProjectField) =>
  !group.isRepeatable && (field.kind === "fee" || field.kind === "signature")

/** A form's closing questions, fees before signatures and each in the form's order, with their sections. */
export function closingQuestions(definition: ProjectTypeDefinition) {
  const closing = definition.groups.flatMap((group) =>
    group.fields.filter((field) => isClosing(group, field)).map((field) => ({ group, field }))
  )
  return [
    ...closing.filter(({ field }) => field.kind === "fee"),
    ...closing.filter(({ field }) => field.kind === "signature")
  ]
}

/** The closing section's heading, from what it asks. */
export function closingHeading(questions: readonly { field: ProjectField }[]) {
  const hasFee = questions.some(({ field }) => field.kind === "fee")
  const hasSignature = questions.some(({ field }) => field.kind === "signature")
  if (hasFee && hasSignature) {
    return "Fee and signature"
  }
  return hasFee ? "Fee" : "Signature"
}

/** A new item of a section: blank, but for the answers given once for every item, which it keeps. */
export function nextItem(group: ProjectGroup, items: readonly Record<string, AnswerValue>[]) {
  const first = items[0] ?? {}
  return {
    ...blankItem(group),
    ...Object.fromEntries(
      group.fields
        .filter((field) => isSharedIn(group, field))
        .map((field) => [field.property, first[field.property] ?? null])
    )
  }
}

/** An answer in words, as the homeowner gave it. */
function answerText(field: ProjectField, value: AnswerValue): string | null {
  if (isBlank(value)) {
    return null
  }
  if (field.kind === "yes-no") {
    return value ? "Yes" : "No"
  }
  if (field.kind === "fee") {
    return `${moneyText(field.amount)}, ${value ? "will pay it" : "not confirmed"}`
  }
  if (field.kind === "number") {
    return field.unit ? `${String(value)} ${field.unit.label}` : String(value)
  }
  if (field.kind === "choice") {
    const option = field.options.find((item) => item.value === value)
    return option ? option.label : `Other: ${String(value)}`
  }
  if (isAnswerRecord(value)) {
    return field.kind === "signature"
      ? `Signed by ${value.name ?? ""}${value.signedOn ? ` on ${value.signedOn}` : ""}`
      : [value.name, value.phone, value.email].filter(Boolean).join(", ")
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
 * The answers as the homeowner and the committee read them back: like `answerLines`, but where a section repeats, an
 * answer given once for every item shows once, above the items, when every item has it; and fees and signatures last.
 */
export function answerSections(definition: ProjectTypeDefinition, answers: ProjectAnswers) {
  const all = answerLines(definition, answers)
  const closing = closingQuestions(definition).flatMap(({ group, field }) => {
    const line = all.find((section) => section.group === group)?.lines.find((item) => item.field === field)?.line
    return line === undefined ? [] : [{ key: `${group.subject} ${field.property}`, line }]
  })
  const sections = all.map((section) => ({
    ...section,
    lines: section.lines.filter((item) => !isClosing(section.group, item.field))
  }))
  const body = definition.groups.flatMap((group) => {
    const items = sections.filter((section) => section.group === group)
    const lineOf = (section: (typeof items)[number], field: ProjectField) =>
      section.lines.find((item) => item.field === field)?.line
    const [first] = items
    const once =
      first && items.length > 1 && items.length === (answers[group.subject] ?? []).length
        ? group.fields.filter(
            (field) =>
              isSharedIn(group, field) &&
              lineOf(first, field) !== undefined &&
              items.every((section) => lineOf(section, field) === lineOf(first, field))
          )
        : []
    const shared = once.flatMap((field) => {
      const line = first ? lineOf(first, field) : undefined
      return line === undefined ? [] : [{ key: field.property, line }]
    })
    return [
      ...(shared.length > 0
        ? [{ key: `${group.subject} every`, heading: `Every ${group.itemLabel.toLowerCase()}`, lines: shared }]
        : []),
      ...items.flatMap((section) => {
        const lines = section.lines
          .filter((item) => !once.includes(item.field))
          .map((item) => ({ key: item.field.property, line: item.line }))
        return lines.length > 0 ? [{ key: `${group.subject} ${section.index}`, heading: section.heading, lines }] : []
      })
    ]
  })
  return closing.length > 0
    ? [...body, { key: "closing", heading: closingHeading(closingQuestions(definition)), lines: closing }]
    : body
}

/**
 * What the review needs to read an answer against the rules, under its line: the question's help, and the passages it
 * cites, by name, so an answer no rule detail is tied to can still be read as what those passages state.
 */
function notesOf(field: ProjectField, citationLabel?: (provisionKey: string) => string | null) {
  const cited = (field.citations ?? []).flatMap((key) => citationLabel?.(key) ?? [])
  return [
    ...(field.help ? [`  Help: ${field.help}`] : []),
    ...(cited.length > 0 ? [`  Cites: ${cited.join("; ")}`] : [])
  ]
}

/**
 * The answers as a page of the packet, so every stage reads them like the homeowner's other pages and cites them as
 * evidence: the project type, then each item's answers, each with its question's help and cited passages.
 */
export function withAnswersPage(
  packet: Packet,
  input: {
    projectType: string | null
    definition: ProjectTypeDefinition | null
    answers: ProjectAnswers | null
    /** A cited passage's name ("Design Guidelines 5.5.1(i)"); null for one the rulebook doesn't have. */
    citationLabel?: (provisionKey: string) => string | null
  }
): Packet {
  const sections = input.definition && input.answers ? answerLines(input.definition, input.answers) : []
  if (sections.length === 0) {
    return packet
  }
  const text = [
    "ANSWERS GIVEN IN THE APPLICATION FORM",
    ...(input.projectType ? [`Project type: ${input.projectType}`] : []),
    ...sections.flatMap((section) => [
      section.heading,
      ...section.lines.flatMap((item) => [item.line, ...notesOf(item.field, input.citationLabel)])
    ])
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
      if (field.binding === null || Array.isArray(value) || isAnswerRecord(value)) {
        return []
      }
      const answer: FactAnswer = {
        entity: entity.id,
        property: field.binding,
        state: "known",
        stated: answerText(field, value),
        reading: field.kind === "number" && field.unit ? { value, unit: field.unit.key } : value,
        evidence: [{ fileId: answersFileId, page: 1, quote: line }],
        confidence: 0.95
      }
      if (field.kind !== "choice") {
        return answer
      }
      // A value the administrator added is its own, never one of the rulebook's; an "Other" answer is the homeowner's
      // description, which no rule can test.
      const option = field.options.find((item) => item.value === value)
      if (!option) {
        return {
          ...answer,
          state: "uncertain" as const,
          stated: String(value),
          reading: null,
          asWritten: "description" as const
        }
      }
      return option.isAdded ? { ...answer, stated: option.label, reading: null, asWritten: "value" as const } : answer
    })
  })
}

/** The passages the form's questions cite, which the review selects the citing rules by. */
export const citedProvisions = (definition: ProjectTypeDefinition | null): string[] => [
  ...new Set(definition?.groups.flatMap((group) => group.fields.flatMap((field) => field.citations ?? [])) ?? [])
]

/**
 * The fact plan with, on each property, the form's questions that cite passages of rules reading it but answer no rules'
 * detail themselves: a question's citations are what its answer is checked against, so the facts stage reads the
 * answer for the details those rules test, and code verifies what it reads against the quoted answer.
 */
export function withFormQuestions(
  plan: FactPlan,
  input: {
    definition: ProjectTypeDefinition | null
    rulesFile: T.RulesFile
    selected: readonly T.RuleKey[]
    requestType: T.TermKey
  }
): FactPlan {
  const questions = (input.definition?.groups ?? []).flatMap((group) =>
    group.fields.filter((field) => field.binding === null && (field.citations ?? []).length > 0)
  )
  if (questions.length === 0) {
    return plan
  }
  const selected = new Set(input.selected)
  const asked = new Map<string, string[]>()
  for (const field of questions) {
    const cites = new Set(field.citations ?? [])
    const rules = input.rulesFile.rules
      .filter((rule) => selected.has(rule.key) && rule.citations.some((citation) => cites.has(citation.provisionKey)))
      .map((rule) => rule.key)
    for (const property of planFacts(input.rulesFile, rules, input.requestType).properties) {
      asked.set(property.key, [...new Set([...(asked.get(property.key) ?? []), field.label])])
    }
  }
  return {
    ...plan,
    properties: plan.properties.map((property) => ({
      ...property,
      askedInForm: [...new Set([...property.askedInForm, ...(asked.get(property.key) ?? [])])]
    }))
  }
}
