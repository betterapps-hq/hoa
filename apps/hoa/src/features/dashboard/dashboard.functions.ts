import { createServerFn } from "@tanstack/react-start"
import { canSee, type Application } from "@/applications/application"
import { listApplications, listReviewSummaries } from "@/db/applicationRepository"
import { getDb } from "@/db/client.server"
import { listUploadHistory } from "@/db/documentRepository"
import { listProjectTypeAdditions, listProjectTypes } from "@/db/projectTypeRepository"
import { getRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebookByStatus, listPublishedRulebooks } from "@/db/rulebookRepository"
import { reviewSchema } from "@/review/reviewModel"
import { getRequestContext } from "@/session/requestContext.server"
import { userOf } from "@/session/users"
import { applicationKeys } from "@/storage/keys"
import { getJson } from "@/storage/objects"
import { getBucket } from "@/storage/storage.server"
import { recentActivity, type ActivityEvent } from "./activity"
import type { DashboardApplication } from "./dashboardData"

/** The next rulebook, as the HOA management dashboard shows it: being built, or a draft with work left to review. */
export type NextRulebook =
  | { status: "building" }
  | { status: "draft"; createdAt: string; rulesToReview: number; openQuestions: number }

/** The rulebook that's coming, for administrators; null when there's none, and always for homeowners. */
export const getNextRulebook = createServerFn({ method: "GET" }).handler(async (): Promise<NextRulebook | null> => {
  const context = await getRequestContext()
  if (context.role !== "administrator") {
    return null
  }
  const db = getDb()
  const [building, draft] = await Promise.all([
    getRulebookByStatus(db, context.hoa.id, "building"),
    getRulebookByStatus(db, context.hoa.id, "draft")
  ])
  if (building) {
    return { status: "building" }
  }
  if (!draft) {
    return null
  }
  const content = await getRulebookContent(db, context.hoa.id, draft.id)
  return {
    status: "draft",
    createdAt: draft.createdAt,
    rulesToReview: content?.rules.filter((rule) => rule.review.status === "proposed").length ?? 0,
    openQuestions: content?.questions.filter((question) => question.answer === null).length ?? 0
  }
})

/**
 * What the latest review asks the homeowner to add, while the application is theirs to change. A review the bucket
 * can't serve or parse is logged and read as asking for nothing, so the dashboard still lists the application.
 */
async function missingInformation(hoaId: string, application: Application): Promise<string[]> {
  if (!application.reviewId || !["reviewed", "information-requested"].includes(application.status)) {
    return []
  }
  try {
    const key = applicationKeys(hoaId, application.id).review(application.reviewId)
    const review = await getJson(getBucket(), key, reviewSchema)
    return review?.missingInformation.map((item) => item.text) ?? []
  } catch (error) {
    console.error(error)
    return []
  }
}

/** A homeowner's own applications, or every application for the committee, as the dashboards list them. */
export const listDashboardApplications = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardApplication[]> => {
    const context = await getRequestContext()
    const db = getDb()
    const [applications, types] = await Promise.all([
      listApplications(db, context.hoa.id, context.role === "administrator" ? {} : { createdBy: context.user.id }),
      listProjectTypes(db, context.hoa.id)
    ])
    // A draft is its homeowner's own: the committee sees an application once it's submitted.
    const viewer = { userId: context.user.id, isCommittee: context.role === "administrator" }
    return Promise.all(
      applications
        .filter((application) => canSee(application, viewer))
        .map(async (application) => {
          const [reviews, missing] = await Promise.all([
            listReviewSummaries(db, context.hoa.id, application.id),
            missingInformation(context.hoa.id, application)
          ])
          return {
            id: application.id,
            description: application.description,
            status: application.status,
            createdAt: application.createdAt,
            updatedAt: application.updatedAt,
            revisedAt: application.revisedAt,
            submittedAt: application.submittedAt,
            projectTypeLabel:
              application.projectTypeId === null
                ? null
                : (types.find((type) => type.id === application.projectTypeId)?.label ?? null),
            decision: application.decision
              ? {
                  outcome: application.decision.outcome,
                  note: application.decision.note,
                  decidedAt: application.decision.decidedAt
                }
              : null,
            reviews: reviews.map(({ recommendation, createdAt }) => ({ recommendation, createdAt })),
            missingInformation: missing
          }
        })
    )
  }
)

/**
 * What happened lately, newest first, each naming the person who did it: across the HOA's areas for the committee; for a
 * homeowner, what happened to their applications and the rules.
 */
export const listRecentActivity = createServerFn({ method: "GET" }).handler(async (): Promise<ActivityEvent[]> => {
  const context = await getRequestContext()
  const isCommittee = context.role === "administrator"
  const db = getDb()
  const [applications, projectTypes, rulebooks, documents] = await Promise.all([
    listApplications(db, context.hoa.id, isCommittee ? {} : { createdBy: context.user.id }),
    listProjectTypeAdditions(db, context.hoa.id),
    listPublishedRulebooks(db, context.hoa.id),
    isCommittee ? listUploadHistory(db, context.hoa.id) : []
  ])
  const viewer = { userId: context.user.id, isCommittee }
  const labels = new Map(projectTypes.map((type) => [type.id, type.label]))
  return recentActivity({
    applications: applications
      .filter((application) => canSee(application, viewer))
      .map((application) => ({
        ...application,
        projectTypeLabel: application.projectTypeId ? (labels.get(application.projectTypeId) ?? null) : null
      })),
    projectTypes: isCommittee ? projectTypes : [],
    rulebooks,
    documents,
    nameOf: (userId) => userOf(userId).name
  })
})
