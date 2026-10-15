import { describe, expect, it } from "vitest"
import { deviceOf, lastUsedText } from "./devices"

describe("lastUsedText", () => {
  const asOf = "2026-10-14T12:00:00.000Z"

  it("says the day a browser was last used", () => {
    expect(lastUsedText("2026-10-14T11:55:00.000Z", asOf)).toBe("Last used today")
    expect(lastUsedText("2026-10-13T09:00:00.000Z", asOf)).toBe("Last used yesterday")
    expect(lastUsedText("2026-10-10T09:00:00.000Z", asOf)).toBe("Last used 4 days ago")
  })
})

describe("deviceOf", () => {
  it("names a browser and its system", () => {
    expect(
      deviceOf(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
      )
    ).toEqual({ name: "Chrome on Windows", kind: "desktop" })
  })

  it("tells a phone from a computer", () => {
    expect(
      deviceOf(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ name: "Safari on iOS", kind: "mobile" })
  })

  it("says so when the browser didn't say what it is", () => {
    expect(deviceOf(null)).toEqual({ name: "Unknown browser", kind: "desktop" })
  })
})
