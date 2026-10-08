import { z } from "zod"
import { componentKinds, documentRequirementIds } from "@/rules/catalog"
import { promptVersionSchema } from "@/rules/rule"

// The review model from docs/design/review.md. The facts and documents schemas are also the models' output schemas.

export const componentSchema = z.object({
  id: z.string(),
  kind: z.enum(componentKinds),
  label: z.string()
})
export type Component = z.infer<typeof componentSchema>

export const evidenceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    fileId: z.string(),
    pageIndex: z.number().int().positive(),
    quote: z.string().nullable(),
    figureId: z.string().nullable(),
    description: z.string().nullable()
  }),
  z.object({ source: z.literal("description"), quote: z.string() })
])
export type Evidence = z.infer<typeof evidenceSchema>

export const factSchema = z.object({
  attribute: z.string(),
  componentId: z.string().nullable(),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  rawValue: z.string().nullable(),
  valueMatch: z.enum(["canonical", "unlisted", "uncertain"]).nullable(),
  status: z.enum(["stated", "inferred", "not-provided", "none", "conflicting"]),
  evidence: z.array(evidenceSchema)
})
export type Fact = z.infer<typeof factSchema>

export const conditionAnswerSchema = z.object({
  conditionId: z.string(),
  componentId: z.string().nullable(),
  answer: z.enum(["true", "false", "unknown"]),
  evidence: z.array(evidenceSchema)
})
export type ConditionAnswer = z.infer<typeof conditionAnswerSchema>

export const documentProblems = [
  "blank",
  "unsigned",
  "missing-signer",
  "missing-statement",
  "contradicts-packet"
] as const

export const documentStatusSchema = z.object({
  requirement: z.enum(documentRequirementIds),
  componentId: z.string().nullable(),
  status: z.enum(["present", "missing", "incomplete", "unreadable"]),
  problems: z.array(z.enum(documentProblems)),
  /** Roles, not names: "applicant", "co-owner", "neighbor". */
  signers: z.array(z.string()),
  evidence: z.array(evidenceSchema)
})
export type DocumentStatus = z.infer<typeof documentStatusSchema>

export const findingStatuses = ["not-met", "unclear", "needs-committee", "met", "not-applicable"] as const
export type FindingStatus = (typeof findingStatuses)[number]

export const findingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  componentId: z.string().nullable(),
  status: z.enum(findingStatuses),
  explanation: z.string(),
  evidence: z.array(evidenceSchema),
  documentProblems: z.array(z.enum(documentProblems)),
  decidedBy: z.enum(["code", "model"])
})
export type Finding = z.infer<typeof findingSchema>

export const recommendations = ["approve", "approve-with-conditions", "request-information", "reject"] as const
export type Recommendation = (typeof recommendations)[number]

export const actionItemSchema = z.object({ id: z.string(), findingIds: z.array(z.string()), text: z.string() })
export type ActionItem = z.infer<typeof actionItemSchema>

export const reviewSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  jobId: z.string(),
  rulebookId: z.string(),
  rulebookVersion: z.number().int(),
  components: z.array(componentSchema),
  facts: z.array(factSchema),
  conditionAnswers: z.array(conditionAnswerSchema),
  documents: z.array(documentStatusSchema),
  findings: z.array(findingSchema),
  recommendation: z.enum(recommendations),
  changes: z.array(actionItemSchema),
  missingInformation: z.array(actionItemSchema),
  committeeDecisions: z.array(actionItemSchema),
  assessment: z.string(),
  feedback: z.string(),
  promptVersions: z.record(z.string(), promptVersionSchema),
  costUsd: z.number(),
  durationMs: z.number(),
  sessionId: z.string(),
  createdAt: z.string()
})
