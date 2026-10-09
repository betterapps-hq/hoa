import { z } from "zod"

// An organization's project types (application-review.md, Project types): what a homeowner picks when starting an
// application. Each is the organization's data: a label and description the review's models read, and a definition
// of the form the homeowner fills in and the documents they upload. Every field binds to a property a rule tests, and
// every document to the rules that require it, so the answers are facts and the documents are what the rules ask for.

const fieldBase = {
  /** The property the answer is a fact of; unique within its group. */
  property: z.string(),
  label: z.string().min(1),
  help: z.string().nullable(),
  isRequired: z.boolean()
}

export const projectField = z.discriminatedUnion("kind", [
  z.object({ ...fieldBase, kind: z.literal("text") }),
  z.object({ ...fieldBase, kind: z.literal("long-text") }),
  z.object({
    ...fieldBase,
    kind: z.literal("number"),
    /** The unit the answer is in; null for a count. */
    unit: z.object({ key: z.string(), label: z.string() }).nullable()
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("choice"),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
    /** Whether the homeowner may write a value the list doesn't name (the rulebook's set is open). */
    allowsOther: z.boolean()
  }),
  z.object({ ...fieldBase, kind: z.literal("yes-no") }),
  z.object({ ...fieldBase, kind: z.literal("date") })
])
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

/** A document the rules require, uploaded on its own with what it must show. */
export const projectDocument = z.object({
  documentType: z.string(),
  label: z.string(),
  mustShow: z.array(z.string()),
  /** The rules that require it. */
  ruleKeys: z.array(z.string()).min(1),
  isRequired: z.boolean()
})
export type ProjectDocument = z.infer<typeof projectDocument>

export const projectTypeDefinition = z.object({
  /** The things the project type covers, which the rules apply to. */
  subjects: z.array(z.string()),
  groups: z.array(projectGroup),
  documents: z.array(projectDocument)
})
export type ProjectTypeDefinition = z.infer<typeof projectTypeDefinition>

export const projectTypeStatuses = ["active", "retired"] as const

export const projectTypeSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  /** Retired types are hidden from new applications and kept for the ones that use them. */
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

export const answerValue = z.union([z.string(), z.number(), z.boolean()]).nullable()
export type AnswerValue = z.infer<typeof answerValue>

/** The homeowner's answers: per group (by subject), one record per item, keyed by property. */
export const projectAnswers = z.record(z.string(), z.array(z.record(z.string(), answerValue)))
export type ProjectAnswers = z.infer<typeof projectAnswers>
