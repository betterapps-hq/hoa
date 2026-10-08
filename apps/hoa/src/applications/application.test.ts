import { describe, expect, it } from "vitest"
import { deleteAfterFor } from "./application"

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
