import { describe, expect, it } from "vitest"
import {
  homeownerSampleActivity,
  homeownerSampleAttention,
  homeownerSampleStandings,
  managementSampleAttention,
  managementSampleUpcoming
} from "./samples"

describe("samples", () => {
  it("dates every sample from the moment the dashboard is read, so they stay current", () => {
    const [dues, notice] = homeownerSampleAttention("2026-12-20T12:00:00.000Z")
    expect(dues?.aside).toBe("Due Jan 1")
    expect(notice?.aside).toBe("Fix by Dec 30")
    expect(homeownerSampleStandings("2026-12-20T12:00:00.000Z")[0]?.text).toBe(
      "Paid through Dec 31. The next assessment, $350, is due Jan 1."
    )
    expect(homeownerSampleActivity("2026-12-20T12:00:00.000Z").map((sample) => sample.at)).toEqual([
      "2026-12-18T12:00:00.000Z",
      "2026-12-14T12:00:00.000Z"
    ])
  })

  it("dates the community's samples from the same moment, with what's coming up soonest first", () => {
    const asOf = "2026-12-20T12:00:00.000Z"
    expect(managementSampleAttention(asOf).map((sample) => sample.aside)).toEqual([
      "Were due Dec 1",
      "Asked Dec 17",
      "Reported Dec 11",
      "Due Dec 24"
    ])
    expect(managementSampleUpcoming(asOf).map((sample) => sample.subject)).toEqual([
      "Board meeting",
      "Courtesy notice deadline",
      "Quarterly assessment due",
      "Board election ballots open"
    ])
  })
})
