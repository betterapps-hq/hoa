import { z } from "zod"
import { componentKinds, documentRequirementIds, projectTypeIds } from "./catalog"

// The rule model from docs/design/rules.md. These schemas validate stored rules and, in their candidate form, the
// extraction model's output.

export const errorInfoSchema = z.object({ stage: z.string(), message: z.string(), isRetryable: z.boolean() })

/** The Langfuse prompt version a model call used. */
export const promptVersionSchema = z.number().int()

export const ruleTopics = [
  "material",
  "color",
  "dimension",
  "placement",
  "style",
  "documentation",
  "neighbor",
  "process",
  "maintenance"
] as const

export const factConditionSchema = z.object({
  type: z.literal("fact"),
  attribute: z.string(),
  operator: z.enum(["equals", "in", "not-in", "exists"]),
  value: z.union([z.string(), z.array(z.string()), z.boolean()]).nullable()
})

export const textConditionSchema = z.object({
  type: z.literal("text"),
  /** "{ruleId}:c{index}", set by code. */
  id: z.string(),
  description: z.string()
})

export const conditionSchema = z.discriminatedUnion("type", [factConditionSchema, textConditionSchema])
export type Condition = z.infer<typeof conditionSchema>

export const allowedValueSchema = z.object({ value: z.string(), aliases: z.array(z.string()) })
export type AllowedValue = z.infer<typeof allowedValueSchema>

export const checkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("allowed-values"),
    attribute: z.string(),
    values: z.array(allowedValueSchema),
    otherwise: z.enum(["not-met", "committee"])
  }),
  z.object({
    type: z.literal("allowed-values-by"),
    keyAttribute: z.string(),
    attribute: z.string(),
    table: z.array(z.object({ key: allowedValueSchema, values: z.array(allowedValueSchema) })),
    unknownKey: z.enum(["not-met", "committee"])
  }),
  z.object({ type: z.literal("prohibited-values"), attribute: z.string(), values: z.array(allowedValueSchema) }),
  z.object({
    type: z.literal("range"),
    attributes: z.array(z.string()).min(1),
    min: z.number().nullable(),
    max: z.number().nullable()
  }),
  z.object({ type: z.literal("matches"), attribute: z.string(), otherAttribute: z.string() }),
  z.object({ type: z.literal("required-fact"), attribute: z.string() }),
  z.object({
    type: z.literal("required-document"),
    document: z.enum(documentRequirementIds),
    mustState: z.array(z.string())
  }),
  z.object({ type: z.literal("qualitative"), criterion: z.string() }),
  z.object({ type: z.literal("informational") })
])
export type Check = z.infer<typeof checkSchema>

export const citationMatchSchema = z.object({
  status: z.enum(["exact", "fuzzy", "not-found"]),
  score: z.number(),
  touchesLowConfidence: z.boolean()
})

export const citationSchema = z.object({
  documentId: z.string(),
  section: z.string(),
  pageIndex: z.number().int().positive(),
  pageLabel: z.string().nullable(),
  quote: z.string(),
  match: citationMatchSchema
})

export const ruleIssueCodes = [
  "citation-not-found",
  "low-confidence",
  "unknown-attribute",
  "invalid-value",
  "sanity",
  "conflict",
  "duplicate-key",
  "unresolved-reference"
] as const

export const ruleIssueSchema = z.object({
  code: z.enum(ruleIssueCodes),
  message: z.string(),
  relatedRuleIds: z.array(z.string()).optional(),
  resolution: z.object({ note: z.string(), resolvedBy: z.string(), resolvedAt: z.string() }).nullable()
})

export const provenanceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("extraction"),
    jobId: z.string(),
    sectionId: z.string(),
    model: z.string(),
    promptName: z.string(),
    promptVersion: promptVersionSchema
  }),
  z.object({ source: z.literal("administrator"), userId: z.string(), createdAt: z.string() })
])

export const reviewStateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  isEdited: z.boolean(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  note: z.string().nullable()
})

/** The parts of a rule the extraction model writes; code adds the rest. */
const ruleContentShape = {
  title: z.string().min(1),
  statement: z.string().min(1),
  projectTypes: z.array(z.enum(projectTypeIds)).min(1),
  appliesTo: z.enum(["project", ...componentKinds]),
  topic: z.enum(ruleTopics),
  obligation: z.enum(["required", "prohibited", "permitted", "recommended"]),
  discretion: z.enum(["objective", "committee"]),
  isCurable: z.boolean(),
  check: checkSchema,
  exceptions: z.array(z.string())
}

export const ruleSchema = z.object({
  id: z.string(),
  ruleKey: z.string(),
  rulebookId: z.string(),
  ...ruleContentShape,
  appliesWhen: z.array(conditionSchema),
  modifies: z.string().nullable(),
  citations: z.array(citationSchema).min(1),
  issues: z.array(ruleIssueSchema),
  extractedHash: z.string().nullable(),
  change: z.enum(["new", "changed", "unchanged"]).nullable(),
  provenance: provenanceSchema,
  review: reviewStateSchema
})
export type Rule = z.infer<typeof ruleSchema>

/** The extraction model's output: text conditions have no id yet, and citations point at a section and page. */
export const candidateRuleSchema = z.object({
  ...ruleContentShape,
  appliesWhen: z.array(z.discriminatedUnion("type", [factConditionSchema, textConditionSchema.omit({ id: true })])),
  citations: z
    .array(z.object({ section: z.string(), pageIndex: z.number().int().positive(), quote: z.string() }))
    .min(1)
})

export const rulebookSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  version: z.number().int().positive().nullable(),
  status: z.enum(["building", "draft", "published", "superseded", "failed"]),
  error: errorInfoSchema.nullable(),
  catalogVersion: z.number().int(),
  sourceDocumentIds: z.array(z.string()),
  jobId: z.string(),
  createdAt: z.string(),
  publishedBy: z.string().nullable(),
  publishedAt: z.string().nullable()
})
