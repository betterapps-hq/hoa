import { z } from "zod"
import { errorInfoSchema } from "@/shared/schemas"

// Applications and their files (docs/design/documents.md, "Applications").

/** Every application is an architectural application (application-review.md, Load). */
export const applicationRequestType = "architectural-application"

export const applicationStatuses = [
  "draft",
  "reviewing",
  "reviewed",
  "submitted",
  "information-requested",
  "decided"
] as const
export type ApplicationStatus = (typeof applicationStatuses)[number]

export const decisionOutcomes = [
  "approved",
  "approved-with-conditions",
  "approved-in-part",
  "disapproved",
  "information-requested"
] as const

export const decisionSchema = z.object({
  outcome: z.enum(decisionOutcomes),
  note: z.string().nullable(),
  decidedBy: z.string(),
  decidedAt: z.string()
})

export const applicationSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  /** The project kind the homeowner chose: a category of work in the rulebook; null for "Something else". */
  projectKind: z.string().nullable(),
  description: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(applicationStatuses),
  reviewId: z.string().nullable(),
  submittedReviewId: z.string().nullable(),
  submittedAt: z.string().nullable(),
  decision: decisionSchema.nullable(),
  deleteAfter: z.string().nullable()
})
export type Application = z.infer<typeof applicationSchema>

export const applicationFileSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  applicationId: z.string(),
  parentFileId: z.string().nullable(),
  ordinal: z.number().int().nullable(),
  contextText: z.string().nullable(),
  fileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  /** The document type every page shares, from classification. */
  kind: z.string().nullable(),
  status: z.enum(["uploading", "processing", "ready", "unreadable"]),
  error: errorInfoSchema.nullable(),
  createdAt: z.string()
})
export type ApplicationFile = z.infer<typeof applicationFileSchema>

const day = 24 * 60 * 60 * 1000

/** When an application's data is deleted: after the draft period until submitted, after the decision once decided. */
export function deleteAfterFor(
  application: Pick<Application, "status" | "updatedAt" | "decision" | "submittedAt">,
  settings: { retentionDays: number; draftRetentionDays: number }
): string | null {
  if (application.decision) {
    return new Date(Date.parse(application.decision.decidedAt) + settings.retentionDays * day).toISOString()
  }
  if (application.status === "submitted") {
    return null
  }
  return new Date(Date.parse(application.updatedAt) + settings.draftRetentionDays * day).toISOString()
}
