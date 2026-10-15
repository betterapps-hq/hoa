import { describe, expect, it } from "vitest"
import {
  homeownerSampleActivity,
  homeownerSampleStandings,
  homeownerSampleUpcoming,
  managementSampleAttention,
  managementSampleUpcoming
} from "./samples"

describe("samples", () => {
  it("dates every sample from the moment the dashboard is read, so they stay current", () => {
    const asOf = "2026-12-20T12:00:00.000Z"
    expect(homeownerSampleStandings(asOf)[0]?.text).toBe(
      "1 open request: a streetlight out near your home, reported Dec 11."
    )
    expect(homeownerSampleActivity(asOf).map((sample) => sample.at)).toEqual([
      "2026-12-18T12:00:00.000Z",
      "2026-12-14T12:00:00.000Z"
    ])
    expect(homeownerSampleUpcoming(asOf).map((sample) => sample.at)).toEqual(["2026-12-29T12:00:00.000Z"])
  })

  it("dates the community's samples from the same moment, with what's coming up soonest first", () => {
    const asOf = "2026-12-20T12:00:00.000Z"
    expect(managementSampleAttention(asOf).map((sample) => sample.aside)).toEqual(["Reported Dec 11", "Due Dec 24"])
    expect(managementSampleUpcoming(asOf).map((sample) => sample.subject)).toEqual([
      "Board meeting",
      "Board election ballots open"
    ])
  })
})
