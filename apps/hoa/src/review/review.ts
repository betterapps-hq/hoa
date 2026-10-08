import { z } from "zod"

export const recommendations = ["approve", "approve-with-conditions", "request-information", "reject"] as const
export type Recommendation = (typeof recommendations)[number]

export const recommendationLabels: Record<Recommendation, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  "request-information": "Request more information",
  reject: "Reject"
}

export const findingStatuses = ["not-met", "unclear", "met"] as const
export type FindingStatus = (typeof findingStatuses)[number]

export const findingStatusLabels: Record<FindingStatus, string> = {
  "not-met": "Not met",
  unclear: "Can't confirm",
  met: "Met"
}

/** Structured output of the application review prompt. The UI renders these fields directly. */
export const reviewSchema = z.object({
  project: z.object({
    summary: z.string(),
    details: z.array(z.object({ label: z.string(), value: z.string() }))
  }),
  findings: z.array(
    z.object({
      ruleId: z.string(),
      status: z.enum(findingStatuses),
      explanation: z.string(),
      evidence: z.string()
    })
  ),
  missingInformation: z.array(z.string()),
  recommendation: z.enum(recommendations),
  assessment: z.string(),
  conditions: z.array(z.string()),
  feedback: z.string()
})
export type Review = z.infer<typeof reviewSchema>
