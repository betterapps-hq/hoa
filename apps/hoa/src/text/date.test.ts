import { describe, expect, it } from "vitest"
import { parseDate } from "./date"

describe("parseDate", () => {
  it.each([
    ["09/04/26", "2026-09-04"],
    ["9/4/2026", "2026-09-04"],
    ["9-4-2026", "2026-09-04"],
    ["2026-09-04", "2026-09-04"],
    ["September 4, 2026", "2026-09-04"],
    ["Sept. 4, 2026", "2026-09-04"],
    ["Sept. 4", "2026-09-04"],
    ["Paid on Sep 30th", "2026-09-30"],
    ["4 September 2026", "2026-09-04"],
    ["signed 9/4", "2026-09-04"]
  ])("reads %s in US month-day order", (text, expected) => {
    expect(parseDate(text, "2026-10-01")).toBe(expected)
  })

  it.each(["", "soon", "02/30/2026", "9/4/2026 and 9/5/2026"])("refuses %j", (text) => {
    expect(parseDate(text, "2026-10-01")).toBeNull()
  })
})
