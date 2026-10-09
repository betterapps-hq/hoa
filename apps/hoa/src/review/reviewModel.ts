import { z } from "zod"
import { evaluationRequest, evidence, finding } from "@/schema/zod"
import { promptVersionSchema } from "@/shared/schemas"

// The review record (application-review.md, Save): what the review read from the packet, the rules it considered,
// the engine's findings and decision, and the written summary. It goes to R2 as JSON; D1 keeps a summary.

export const recommendations = [
  "approve",
  "approve-with-conditions",
  "request-information",
  "refer-to-committee",
  "deny"
] as const
export type Recommendation = (typeof recommendations)[number]

/** One rule's findings of one kind, phrased for the homeowner, with every entity they cover. */
export const actionItemSchema = z.object({
  id: z.string(),
  ruleKey: z.string(),
  entities: z.array(z.string()),
  text: z.string()
})
export type ActionItem = z.infer<typeof actionItemSchema>

/** A document check's result for one rule and subject, as the document reader found it. */
export const documentResultSchema = z.object({
  ruleKey: z.string(),
  entity: z.string(),
  documentType: z.string(),
  present: z.boolean(),
  statements: z.array(
    z.object({ statement: z.string(), confirmed: z.boolean().nullable(), quote: z.string().nullable() })
  ),
  /** The party entities who signed. */
  signedBy: z.array(z.string()),
  evidence: z.array(evidence)
})
export type DocumentResult = z.infer<typeof documentResultSchema>

/** How a stated value became a typed value; "reading" is the model's reading, when no label matched the words. */
export const normalizationKinds = ["exact", "normalized", "fuzzy", "reading", "parsed", "none"] as const

export const normalizationSchema = z.object({
  entity: z.string(),
  property: z.string(),
  stated: z.string(),
  matchedLabel: z.string().nullable(),
  kind: z.enum(normalizationKinds),
  score: z.number().nullable()
})
export type Normalization = z.infer<typeof normalizationSchema>

export const judgmentResultSchema = z.object({
  ruleKey: z.string(),
  entity: z.string(),
  answer: z.enum(["yes", "no", "unclear"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidence: z.array(evidence)
})

export const conditionAnswerSchema = z.object({
  entity: z.string(),
  text: z.string(),
  holds: z.boolean().nullable()
})

export const reviewSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  jobId: z.string(),
  rulebookId: z.string(),
  rulesFileSha256: z.string(),
  request: evaluationRequest,
  /** Reviewed before submission, so judged as of the evaluation date. */
  provisional: z.boolean(),
  /** Every rule considered. */
  selected: z.array(z.string()),
  documents: z.array(documentResultSchema),
  normalizations: z.array(normalizationSchema),
  judgments: z.array(judgmentResultSchema),
  conditionAnswers: z.array(conditionAnswerSchema),
  findings: z.array(finding),
  recommendation: z.enum(recommendations),
  changes: z.array(actionItemSchema),
  missingInformation: z.array(actionItemSchema),
  committeeDecisions: z.array(actionItemSchema),
  suggestions: z.array(actionItemSchema),
  assessment: z.string(),
  feedback: z.string(),
  promptVersions: z.record(z.string(), promptVersionSchema),
  costUsd: z.number(),
  durationMs: z.number(),
  sessionId: z.string(),
  createdAt: z.string()
})
export type Review = z.infer<typeof reviewSchema>

/** Whether submitting means going ahead with open requests, which the homeowner must confirm. */
export function hasOpenRequests(review: Pick<Review, "recommendation" | "missingInformation">) {
  return review.recommendation === "request-information" || review.missingInformation.length > 0
}
