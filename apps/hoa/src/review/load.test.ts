import { describe, expect, it } from "vitest"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { localDate, requestSkeleton } from "./load"

const rulesFile = sampleRulesFile()
const input = {
  organizationId: "org",
  rulesFile,
  requestType: "architectural-application",
  now: "2026-10-02T05:00:00Z"
}

describe("requestSkeleton", () => {
  it("judges a submitted application as of its submission date, with that date as a fact", () => {
    const skeleton = requestSkeleton({ ...input, submittedOn: "2026-09-30" })
    expect(skeleton).toMatchObject({ governingDate: "2026-09-30", evaluationDate: "2026-10-01", provisional: false })
    expect(skeleton.facts).toEqual([
      expect.objectContaining({
        entity: "request",
        property: "architectural-application.submitted-on",
        value: { type: "date", value: "2026-09-30" }
      })
    ])
  })

  it("judges an unsubmitted one as of the evaluation date, provisionally", () => {
    expect(requestSkeleton({ ...input, submittedOn: null })).toMatchObject({
      governingDate: "2026-10-01",
      provisional: true,
      facts: []
    })
  })

  it("reads dates in the organization's time zone", () => {
    expect(localDate("2026-10-02T05:00:00Z", "America/Los_Angeles")).toBe("2026-10-01")
    expect(localDate("2026-10-02T05:00:00Z", "UTC")).toBe("2026-10-02")
  })
})
