import { z } from "zod"

// An organization's project types (application-review.md, Project types): what a homeowner picks when starting an
// application. Each is the organization's data: a label and description the review's models read, and a definition
// of the form the homeowner fills in and the documents they upload. A question bound to a property a rule tests is a
// fact the review checks; the administrator's own questions are context the review and the committee read. Every
// document comes from the rules that require it.

const fieldBase = {
  /** The answer's key within its group: the property a rule tests for a bound question, its own key otherwise. */
  property: z.string(),
  /** The property the review reads the answer as a fact of; null for the administrator's own question. */
  binding: z.string().nullable(),
  /** The question as the homeowner reads it. */
  label: z.string().min(1),
  /** A short explanation the form shows with the question. */
  help: z.string().nullable(),
  /** An example answer, shown in the empty input; null for none. */
  example: z.string().nullable().default(null),
  isRequired: z.boolean(),
  /**
   * In a section that repeats, answered once for every item (the same material for every fence run) instead of for
   * each: the form asks it above the items and every item keeps the answer. Absent, it's asked for each item; ignored
   * in a section that doesn't repeat.
   */
  isShared: z.boolean().optional(),
  /** Who can usually state it: the applicant, or only the association. */
  answeredBy: z.enum(["applicant", "association"]).default("applicant"),
  /**
   * The provisions the question cites, by key: a bound question starts with its rules' citations, and then the list is
   * the administrator's. Null until set, which reads as the rules' citations.
   */
  citations: z.array(z.string()).nullable().default(null)
}

/** A unit an amount can be given in, as the quantity grammar reads it (src/text/quantity.ts). */
const amountUnit = z.object({
  unit: z.string(),
  labels: z.array(z.string()),
  /** Its size in its dimension's base unit; null when it doesn't convert. */
  perBase: z.string().nullable()
})

const choiceOptions = z.array(z.object({ value: z.string(), label: z.string().min(1) })).min(1)

const fieldKinds = z.discriminatedUnion("kind", [
  z.object({ ...fieldBase, kind: z.literal("text") }),
  z.object({ ...fieldBase, kind: z.literal("long-text") }),
  z.object({
    ...fieldBase,
    kind: z.literal("number"),
    /** The unit the answer is in; null for a count. */
    unit: z.object({ key: z.string(), label: z.string() }).nullable(),
    /** What the amount measures (length, area, elapsed time...), which picks its input; null for a count. */
    dimension: z.string().nullable().default(null),
    /** The units of the same dimension the homeowner may give it in (feet and inches for inches), its own first. */
    units: z.array(amountUnit).default([])
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("choice"),
    /**
     * In the order homeowners see them. A bound question's are the rulebook's values it offers and the
     * administrator's own (`isAdded`).
     */
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string().min(1),
          /**
           * The administrator's own value of a bound question's property, beside the rulebook's (the back, when the
           * rules name only the front and sides). It reaches the review as a value of its own, never as one of the
           * rulebook's. Its value is a key made from its label when it's added, kept when the label changes. Code
           * never adds one.
           */
          isAdded: z.boolean().default(false)
        })
      )
      .min(1),
    /**
     * Whether the homeowner may pick "Other" and describe the answer in words: on by default when the rulebook's set is
     * open, then the administrator's choice. No rule can test a description, so the review holds the detail
     * uncertain and the rules that read it go to the committee with the homeowner's words.
     */
    allowsOther: z.boolean()
  }),
  /** Any number of the options; only the administrator's own questions ask this way. */
  z.object({ ...fieldBase, kind: z.literal("choices"), options: choiceOptions }),
  z.object({ ...fieldBase, kind: z.literal("yes-no") }),
  z.object({ ...fieldBase, kind: z.literal("date") }),
  z.object({ ...fieldBase, kind: z.literal("time") }),
  /**
   * The homeowner signs what the question states by typing their full name; the answer keeps the name and the day it
   * was signed. Only the administrator's own questions ask this way.
   */
  z.object({ ...fieldBase, kind: z.literal("signature") }),
  /** A person's name, phone and email (a contractor, a neighbor); only the administrator's own questions ask this way. */
  z.object({ ...fieldBase, kind: z.literal("contact") }),
  /**
   * A fee the homeowner pays with the application, such as a filing fee: the form shows the amount, with the help
   * saying how to pay, and the homeowner confirms they'll pay it. Paying happens outside the app.
   */
  z.object({
    ...fieldBase,
    kind: z.literal("fee"),
    /** In dollars. */
    amount: z.number().positive()
  })
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A question; one stored before questions could be the administrator's own is bound to its property. */
export const projectField = z.preprocess(
  (value) => (isRecord(value) && !("binding" in value) ? { ...value, binding: value.property } : value),
  fieldKinds
)
export type ProjectField = z.infer<typeof projectField>

/** The fields about one subject of the project: the work itself once, or each item of a kind the rules regulate. */
export const projectGroup = z.object({
  /** The thing the answers describe (the work, or a thing rules apply to); unique within the definition. */
  subject: z.string(),
  label: z.string(),
  /** One item's name, numbered in the form: "Item 1". */
  itemLabel: z.string(),
  help: z.string().nullable(),
  isRepeatable: z.boolean(),
  fields: z.array(projectField)
})
export type ProjectGroup = z.infer<typeof projectGroup>

export const uploadFormats = ["pdf", "docx", "image"] as const

/**
 * A file the administrator gives homeowners to fill in as a document, such as a form for a neighbor to sign: stored
 * with the project type (src/storage/keys.ts, `projectTypeKeys`), a new object for every new file.
 */
export const documentTemplate = z.object({
  id: z.uuid(),
  fileName: z.string().min(1).max(200),
  mediaType: z.string(),
  sizeBytes: z.number().int().positive()
})
export type DocumentTemplate = z.infer<typeof documentTemplate>

/**
 * A document the form asks for, uploaded with what it must show: one the rules require, or one the administrator
 * asks for themselves (no rules; its own key, "custom.").
 */
export const projectDocument = z.object({
  documentType: z.string(),
  label: z.string().min(1),
  mustShow: z.array(z.string()),
  /** The rules that require it; none for the administrator's own. */
  ruleKeys: z.array(z.string()),
  isRequired: z.boolean(),
  /** The passages it cites, by provision key, for the administrator's own; a required one cites its rules'. */
  citations: z.array(z.string()).default([]),
  /** The file formats it takes; null for every format applications take. */
  accepts: z.array(z.enum(uploadFormats)).nullable().default(null),
  /** The form homeowners download, fill in and upload as this document; absent for none. */
  template: documentTemplate.optional()
})
export type ProjectDocument = z.infer<typeof projectDocument>

/** A question the rules could ask that the form doesn't, kept with its wording so adding it back keeps it. */
export const unaskedField = z.object({ subject: z.string(), field: projectField })
export type UnaskedField = z.infer<typeof unaskedField>

export const projectTypeDefinition = z.object({
  /** The things the project type covers, which the rules apply to. */
  subjects: z.array(z.string()),
  /** The form's sections and questions, in the order homeowners see them. */
  groups: z.array(projectGroup),
  /** The documents the form asks for, in the order homeowners see them. */
  documents: z.array(projectDocument),
  /**
   * The documents the rules require that the application form itself provides (its answers, the description): met by
   * the form, so never asked for as uploads.
   */
  formDocuments: z.array(projectDocument).default([]),
  unasked: z.array(unaskedField).default([])
})
export type ProjectTypeDefinition = z.infer<typeof projectTypeDefinition>

export const projectTypeStatuses = ["active", "archived"] as const
export type ProjectTypeStatus = (typeof projectTypeStatuses)[number]

export const projectTypeSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  /** Archived types are hidden from new applications and kept for the ones that use them. */
  status: z.enum(projectTypeStatuses),
  /** The rulebook the definition was built against. */
  rulebookId: z.string().nullable(),
  definition: projectTypeDefinition,
  createdAt: z.string(),
  updatedAt: z.string()
})
export type ProjectType = z.infer<typeof projectTypeSchema>

/** What an administrator types for a project type. */
export const projectTypeDetails = z.object({
  label: z.string().trim().min(1, "Give the project type a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters.")
})

/** An answer: text, an amount, yes or no, several choices, or a record of named parts (a signature, a contact). */
export const answerValue = z
  .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.record(z.string(), z.string())])
  .nullable()
export type AnswerValue = z.infer<typeof answerValue>

/** The homeowner's answers: per group (by subject), one record per item, keyed by property. */
export const projectAnswers = z.record(z.string(), z.array(z.record(z.string(), answerValue)))
export type ProjectAnswers = z.infer<typeof projectAnswers>
