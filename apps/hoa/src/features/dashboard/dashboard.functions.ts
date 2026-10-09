import { createServerFn } from "@tanstack/react-start"
import { getDb } from "@/db/client.server"
import { getRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebookByStatus } from "@/db/rulebookRepository"
import { getRequestContext } from "@/session/requestContext.server"

/** The next rulebook, as the committee's dashboard shows it: being built, or a draft with work left to review. */
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
