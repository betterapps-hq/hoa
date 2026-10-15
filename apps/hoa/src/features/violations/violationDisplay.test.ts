import { describe, expect, it } from "vitest"
import { amountText, eventText, firstStepsText, remainingCents } from "./violationDisplay"
import type { EventView } from "./violations.server"

const daily = { every: { value: 1, unit: "calendar-day" }, each: 2500, periods: 8 }

describe("a sanction's amount in words", () => {
  it("adds up a first amount and what it adds each day while uncured", () => {
    expect(amountText({ type: "fixed", each: 10_000, repeats: daily, total: 30_000, cappedBy: null })).toBe(
      "$100.00, plus $25.00 a day for 8 days: $300.00."
    )
  })

  it("says when a cap or limit lowers the total", () => {
    expect(amountText({ type: "fixed", each: 10_000, repeats: daily, total: 25_000, cappedBy: "limit" })).toBe(
      "$100.00, plus $25.00 a day for 8 days: $300.00, limited to $250.00."
    )
  })

  it("leaves the amount to the board, within what the documents allow", () => {
    expect(amountText({ type: "set-by-imposer", maxEach: 50_000, maxTotal: null })).toBe(
      "The board sets the amount, up to $500.00 each time."
    )
    expect(amountText({ type: "none" })).toBeNull()
  })
})

describe("what's left to impose", () => {
  it("takes what's been imposed from the total, or from the most allowed in all", () => {
    expect(remainingCents({ type: "fixed", each: 10_000, repeats: null, total: 30_000, cappedBy: null }, 10_000)).toBe(
      20_000
    )
    expect(remainingCents({ type: "set-by-imposer", maxEach: 50_000, maxTotal: 100_000 }, 80_000)).toBe(20_000)
    expect(remainingCents({ type: "set-by-imposer", maxEach: null, maxTotal: null }, 0)).toBeNull()
  })
})

describe("the history in words", () => {
  const event = (overrides: Partial<EventView>): EventView => ({
    id: "event-1",
    kind: "note",
    occurredOn: "2026-10-14",
    note: null,
    by: "Sam Rivera",
    delivery: null,
    hearing: null,
    curedInTime: null,
    sanction: null,
    fact: null,
    ...overrides
  })

  it("names each step as the board took it", () => {
    expect(eventText(event({ kind: "notice", delivery: "posted" }))).toBe("Notice posted at the unit")
    expect(eventText(event({ kind: "cured", curedInTime: false }))).toBe("Corrected, after the time to cure")
    expect(eventText(event({ kind: "cured", curedInTime: null }))).toBe("Corrected")
    expect(
      eventText(event({ kind: "sanction", sanction: { title: "Fines", type: "fine", amountCents: 15_000 } }))
    ).toBe("Fines: $150.00")
    expect(eventText(event({ kind: "fact", fact: { label: "cure by", value: "Nov 1, 2026" } }))).toBe(
      "Cure by: Nov 1, 2026"
    )
  })
})

it("says which of the board's steps come first", () => {
  expect(firstStepsText(["notice", "hearing"])).toBe("First, deliver the notice and hold the hearing.")
})
