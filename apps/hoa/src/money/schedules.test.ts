import { describe, expect, it } from "vitest"
import { amountFor, chargesDue, dueDays, nextDueOn, type Schedule } from "./schedules"

// Monthly dues of $350 due on the 1st, set up on October 14, with one unit owing its own amount.

const dues: Schedule = {
  id: "dues",
  organizationId: "hoa",
  name: "Monthly dues",
  category: "dues",
  frequency: "monthly",
  amountCents: 35_000,
  unitAmounts: { "unit-3b": 42_000 },
  firstDueOn: "2026-11-01",
  lastDueOn: null,
  postsFrom: "2026-10-14",
  status: "active",
  createdBy: "user-sam",
  createdAt: "2026-10-14T17:00:00.000Z",
  updatedAt: "2026-10-14T17:00:00.000Z"
}

const units = [
  { id: "unit-12", addedOn: "2025-01-10" },
  { id: "unit-3b", addedOn: "2025-01-10" }
]

describe("dueDays", () => {
  it("steps by the schedule's months, keeping the last day of a shorter month", () => {
    expect(
      dueDays({ frequency: "monthly", firstDueOn: "2027-01-31", lastDueOn: null }, "2027-01-01", "2027-04-30")
    ).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"])
  })

  it("stops at the last due day, and a one-time charge is due once", () => {
    expect(
      dueDays({ frequency: "quarterly", firstDueOn: "2027-01-01", lastDueOn: "2027-07-01" }, "2027-01-01", "2028-01-01")
    ).toEqual(["2027-01-01", "2027-04-01", "2027-07-01"])
    expect(
      dueDays({ frequency: "once", firstDueOn: "2027-03-01", lastDueOn: null }, "2027-01-01", "2028-01-01")
    ).toEqual(["2027-03-01"])
  })
})

describe("chargesDue", () => {
  it("posts each unit's charge 30 days ahead, at its own amount where it has one", () => {
    expect(chargesDue(dues, units, "2026-10-14")).toEqual([
      { unitId: "unit-12", dueOn: "2026-11-01", amountCents: 35_000, postingKey: "schedule:dues:unit-12:2026-11-01" },
      { unitId: "unit-3b", dueOn: "2026-11-01", amountCents: 42_000, postingKey: "schedule:dues:unit-3b:2026-11-01" }
    ])
    expect(chargesDue(dues, units, "2026-10-01")).toEqual([])
  })

  it("catches up on what a missed run didn't post, keyed so it posts once", () => {
    const keys = chargesDue(dues, units.slice(0, 1), "2027-01-05").map((charge) => charge.postingKey)
    expect(keys).toEqual([
      "schedule:dues:unit-12:2026-11-01",
      "schedule:dues:unit-12:2026-12-01",
      "schedule:dues:unit-12:2027-01-01",
      "schedule:dues:unit-12:2027-02-01"
    ])
  })

  it("never charges a unit for days due before it was on the roll, or before the schedule was set up", () => {
    const backdated = { ...dues, firstDueOn: "2026-09-01" }
    expect(chargesDue(backdated, [{ id: "unit-40", addedOn: "2026-12-15" }], "2027-01-05").map((c) => c.dueOn)).toEqual(
      ["2027-01-01", "2027-02-01"]
    )
    expect(chargesDue(backdated, units.slice(0, 1), "2026-10-14").map((c) => c.dueOn)).toEqual(["2026-11-01"])
  })

  it("posts nothing once the schedule has ended", () => {
    expect(chargesDue({ ...dues, status: "ended" }, units, "2026-10-14")).toEqual([])
  })
})

describe("nextDueOn and amountFor", () => {
  it("gives the next due day, none once ended or over, and each unit's amount", () => {
    expect(nextDueOn(dues, "2026-11-02")).toBe("2026-12-01")
    expect(nextDueOn({ ...dues, lastDueOn: "2026-11-01" }, "2026-11-02")).toBeNull()
    expect(nextDueOn({ ...dues, status: "ended" }, "2026-10-14")).toBeNull()
    expect(amountFor(dues, "unit-3b")).toBe(42_000)
    expect(amountFor(dues, "unit-12")).toBe(35_000)
  })
})
