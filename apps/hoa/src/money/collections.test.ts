import { describe, expect, it } from "vitest"
import { chargeStates, scheduleCollection, type Ledger } from "./collections"
import type { LedgerEntry } from "./ledger"

// Three units' November and December dues: one paid, one half paid with the rest waived, one unpaid after its check
// came back.

const entry = (id: string, unitId: string, overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id,
  organizationId: "hoa",
  unitId,
  kind: "charge",
  amountCents: 0,
  postedOn: "2026-10-02",
  dueOn: null,
  category: "dues",
  description: id,
  reference: null,
  ruleKey: null,
  rulebookId: null,
  sourceType: "schedule",
  sourceId: "dues",
  reversesId: null,
  postingKey: null,
  createdBy: "user-sam",
  createdAt: "2026-10-02T10:00:00.000Z",
  ...overrides
})

const dues = (unitId: string, dueOn: string) => entry(`${unitId}-${dueOn}`, unitId, { amountCents: 35_000, dueOn })

const paid: Ledger = {
  entries: [
    dues("unit-12", "2026-11-01"),
    dues("unit-12", "2026-12-01"),
    entry("pay-12", "unit-12", { kind: "payment", amountCents: -35_000, sourceType: "manual", sourceId: null })
  ],
  allocations: [{ fromEntryId: "pay-12", toEntryId: "unit-12-2026-11-01", amountCents: 35_000 }]
}

const halfWaived: Ledger = {
  entries: [
    dues("unit-3b", "2026-11-01"),
    entry("pay-3b", "unit-3b", { kind: "payment", amountCents: -17_500, sourceType: "manual", sourceId: null }),
    entry("waive-3b", "unit-3b", {
      kind: "reversal",
      amountCents: -17_500,
      sourceType: "manual",
      sourceId: null,
      reversesId: "unit-3b-2026-11-01"
    })
  ],
  allocations: [
    { fromEntryId: "pay-3b", toEntryId: "unit-3b-2026-11-01", amountCents: 17_500 },
    { fromEntryId: "waive-3b", toEntryId: "unit-3b-2026-11-01", amountCents: 17_500 }
  ]
}

const bounced: Ledger = {
  entries: [
    dues("unit-31", "2026-11-01"),
    entry("check-31", "unit-31", { kind: "payment", amountCents: -35_000, sourceType: "manual", sourceId: null }),
    entry("return-31", "unit-31", {
      kind: "reversal",
      amountCents: 35_000,
      sourceType: "manual",
      sourceId: null,
      reversesId: "check-31"
    })
  ],
  allocations: [
    { fromEntryId: "check-31", toEntryId: "unit-31-2026-11-01", amountCents: 35_000 },
    { fromEntryId: "return-31", toEntryId: "unit-31-2026-11-01", amountCents: -35_000 }
  ]
}

describe("chargeStates", () => {
  it("tells what's paid from what's waived, and a returned payment pays nothing", () => {
    expect(
      chargeStates(halfWaived).map(({ paidCents, waivedCents, openCents }) => [paidCents, waivedCents, openCents])
    ).toEqual([[17_500, 17_500, 0]])
    expect(chargeStates(bounced).map(({ paidCents, openCents }) => [paidCents, openCents])).toEqual([[0, 35_000]])
  })
})

describe("scheduleCollection", () => {
  it("counts the last due day by today, less what's waived", () => {
    expect(scheduleCollection([paid, halfWaived, bounced], "dues", "2026-11-20")).toEqual({
      dueOn: "2026-11-01",
      chargedCents: 87_500,
      paidCents: 52_500,
      units: 3,
      paidUnits: 2
    })
  })

  it("counts the first one posted before any is due, and none for a schedule that hasn't posted", () => {
    expect(scheduleCollection([paid], "dues", "2026-10-20")?.dueOn).toBe("2026-11-01")
    expect(scheduleCollection([paid], "special", "2026-10-20")).toBeNull()
  })
})
