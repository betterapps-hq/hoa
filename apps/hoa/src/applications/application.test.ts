import { describe, expect, it } from "vitest"
import { canSee, deleteAfterFor, reviewCoversLatest } from "./application"

const settings = { retentionDays: 365, draftRetentionDays: 30 }
const base = { updatedAt: "2026-10-08T00:00:00.000Z", submittedAt: null, decision: null }

describe("deleteAfterFor", () => {
  it("keeps an unsubmitted application for the draft period after its last change", () => {
    expect(deleteAfterFor({ ...base, status: "reviewed" }, settings)).toBe("2026-11-07T00:00:00.000Z")
  })

  it("keeps a submitted application until the committee decides", () => {
    expect(
      deleteAfterFor({ ...base, status: "submitted", submittedAt: "2026-10-09T00:00:00.000Z" }, settings)
    ).toBeNull()
  })

  it("keeps a decided application for the retention period after the decision", () => {
    const decision = {
      outcome: "approved" as const,
      note: null,
      decidedBy: "admin",
      decidedAt: "2026-10-10T00:00:00.000Z"
    }
    expect(deleteAfterFor({ ...base, status: "decided", decision }, settings)).toBe("2027-10-10T00:00:00.000Z")
  })
})

describe("reviewCoversLatest", () => {
  const review = { createdAt: "2026-10-08T12:00:00.000Z" }

  it("covers an application changed before the review ran, or never changed", () => {
    expect(reviewCoversLatest({ revisedAt: "2026-10-08T11:00:00.000Z" }, review)).toBe(true)
    expect(reviewCoversLatest({ revisedAt: null }, review)).toBe(true)
  })

  it("doesn't cover a change after it", () => {
    expect(reviewCoversLatest({ revisedAt: "2026-10-08T12:00:01.000Z" }, review)).toBe(false)
  })
})

describe("canSee", () => {
  const draft = { createdBy: "homeowner", submittedAt: null }
  const submitted = { createdBy: "homeowner", submittedAt: "2026-10-08T12:00:00.000Z" }

  it("keeps a draft to its homeowner, the committee included, until it's submitted", () => {
    expect(canSee(draft, { userId: "homeowner", isCommittee: false })).toBe(true)
    expect(canSee(draft, { userId: "admin", isCommittee: true })).toBe(false)
    expect(canSee(submitted, { userId: "admin", isCommittee: true })).toBe(true)
  })

  it("never shows another homeowner's application", () => {
    expect(canSee(submitted, { userId: "neighbor", isCommittee: false })).toBe(false)
  })
})
