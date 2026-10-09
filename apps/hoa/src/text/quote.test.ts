import { describe, expect, it } from "vitest"
import { matchQuote } from "./quote"

const page =
  "5.4.2 Colors. (i) The composite fence colors shall be limited to those available through the following Manufacturers: TREX: Winchester Grey and Saddle."

describe("matchQuote", () => {
  it("finds an exact quote, ignoring punctuation and case", () => {
    expect(matchQuote("trex winchester grey and saddle", page)).toEqual({ status: "exact", score: 1 })
  })

  it("accepts OCR noise as a fuzzy match", () => {
    const found = matchQuote(
      "The composite fence colors shall be limited to those available through Manufacturers",
      page
    )
    expect(found.status).toBe("fuzzy")
    expect(found.score).toBeGreaterThanOrEqual(0.9)
  })

  it("rejects a quote that isn't there", () => {
    expect(matchQuote("Vinyl fences in Arctic White are approved", page).status).toBe("not-found")
    expect(matchQuote("...", page).status).toBe("not-found")
  })
})
