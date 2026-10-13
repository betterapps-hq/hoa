import { describe, expect, it } from "vitest"
import { sampleActivity, sampleAttention, sampleStandings } from "./samples"

describe("samples", () => {
  it("dates every sample from the moment the dashboard is read, so they stay current", () => {
    const [dues, notice] = sampleAttention("2026-12-20T12:00:00.000Z")
    expect(dues?.aside).toBe("Due Jan 1")
    expect(notice?.aside).toBe("Fix by Dec 30")
    expect(sampleStandings("2026-12-20T12:00:00.000Z")[0]?.text).toBe(
      "Paid through Dec 31. The next assessment, $350, is due Jan 1."
    )
    expect(sampleActivity("2026-12-20T12:00:00.000Z").map((sample) => sample.at)).toEqual([
      "2026-12-18T12:00:00.000Z",
      "2026-12-14T12:00:00.000Z"
    ])
  })
})
