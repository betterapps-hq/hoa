import { describe, expect, it } from "vitest"
import * as C from "./calendar"

const day = C.toDay
const shift: C.Shift = (from, amount, unit) => {
  if (unit === "month") {
    return C.addMonths(from, amount)
  }
  return unit === "calendar-day" ? from + amount : undefined
}

describe("calendar arithmetic (schema.md, Expressions 11)", () => {
  it("counts days and keeps the day of the month, clamped", () => {
    expect(C.fromDay(day("2026-02-03"))).toBe("2026-02-03")
    expect(C.weekdayOf(day("2026-02-03"))).toBe("tue")
    expect(C.fromDay(C.addMonths(day("2026-01-31"), 1))).toBe("2026-02-28")
    expect(C.fromDay(C.addMonths(day("2024-01-31"), 1))).toBe("2024-02-29")
    expect(C.fromDay(C.addMonths(day("2026-03-15"), -15))).toBe("2024-12-15")
    expect(C.minutesOf("22:30")).toBe(1350)
  })

  it("skips weekends and US federal holidays, observed on the nearest weekday", () => {
    const holidays = C.holidayCalendar("us-federal")
    // July 4, 2026 is a Saturday, observed Friday July 3.
    expect(C.isBusinessDay(day("2026-07-03"), holidays)).toBe(false)
    expect(C.fromDay(C.addBusinessDays(day("2026-07-02"), 1, holidays))).toBe("2026-07-06")
    expect(C.fromDay(C.addBusinessDays(day("2026-07-06"), -1, holidays))).toBe("2026-07-02")
    // Thanksgiving 2026 is November 26; Memorial Day May 25; Labor Day September 7.
    expect(C.isBusinessDay(day("2026-11-26"), holidays)).toBe(false)
    expect(C.isBusinessDay(day("2026-05-25"), holidays)).toBe(false)
    expect(C.isBusinessDay(day("2026-09-07"), holidays)).toBe(false)
    // Christmas 2022 was a Sunday, observed Monday the 26th.
    expect(C.isBusinessDay(day("2022-12-26"), holidays)).toBe(false)
    expect(C.fromDay(C.nextBusinessDay(day("2026-07-03"), holidays))).toBe("2026-07-06")
    expect(C.isBusinessDay(day("2026-07-03"), C.holidayCalendar("none"))).toBe(true)
    expect(C.addBusinessDays(day("2026-07-02"), 0, holidays)).toBe(day("2026-07-02"))
  })

  it("reads a timestamp in the organization's local time", () => {
    // 07:30 UTC on February 3 is 01:30 in Chicago.
    expect(C.localMinutes("2026-02-03T07:30:00Z", "America/Chicago")).toBe(day("2026-02-03") * 1440 + 90)
    expect(() => C.localMinutes("someday", "America/Chicago")).toThrow("not a timestamp")
  })

  it("lists a schedule's days and finds its latest occurrence", () => {
    const schedule: C.Schedule = { type: "schedule", weekly: ["mon"], annual: ["12-25"], every: null }
    expect(C.scheduleDays(schedule, day("2026-12-20"), day("2026-12-28"), shift).map(C.fromDay)).toEqual([
      "2026-12-21",
      "2026-12-25",
      "2026-12-28"
    ])
    const quarterly: C.Schedule = {
      type: "schedule",
      weekly: [],
      annual: [],
      every: { value: 3, unit: "month", from: "2026-01-15" }
    }
    expect(C.scheduleDays(quarterly, day("2026-01-01"), day("2026-12-31"), shift).map(C.fromDay)).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15"
    ])
    expect(C.fromDay(C.latestOccurrence(quarterly, day("2026-06-30"), shift) ?? 0)).toBe("2026-04-15")
    const biennial: C.Schedule = { ...quarterly, every: { value: 24, unit: "month", from: "2022-03-01" } }
    expect(C.fromDay(C.latestOccurrence(biennial, day("2025-02-01"), shift) ?? 0)).toBe("2024-03-01")
    expect(
      C.latestOccurrence(
        { ...quarterly, every: { value: 1, unit: "furlong", from: "2026-01-15" } },
        day("2026-06-30"),
        shift
      )
    ).toBe(day("2026-01-15"))
  })
})
