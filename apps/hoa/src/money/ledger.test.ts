import { describe, expect, it } from "vitest"
import {
  allocate,
  applyCredits,
  balanceOf,
  openAmounts,
  reversalOf,
  statementOf,
  type Allocation,
  type LedgerEntry
} from "./ledger"

// A unit with October and November dues and a fine; payments pay the oldest charge due first.

const entry = (id: string, overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id,
  organizationId: "hoa",
  unitId: "unit-12",
  kind: "charge",
  amountCents: 0,
  postedOn: "2026-10-01",
  dueOn: null,
  category: null,
  description: id,
  reference: null,
  ruleKey: null,
  rulebookId: null,
  sourceType: "manual",
  sourceId: null,
  reversesId: null,
  postingKey: null,
  createdBy: "user-sam",
  createdAt: `2026-10-01T00:00:0${id.length % 10}.000Z`,
  ...overrides
})

const october = entry("dues-oct", { amountCents: 25_000, postedOn: "2026-09-01", dueOn: "2026-10-01" })
const november = entry("dues-nov", { amountCents: 25_000, postedOn: "2026-10-01", dueOn: "2026-11-01" })
const fine = entry("fine", { amountCents: 10_000, postedOn: "2026-10-14", dueOn: "2026-10-14", category: "fine" })
const charges = [november, fine, october]

describe("paying charges", () => {
  it("pays the oldest charge due first, and keeps what's left over", () => {
    const open = openAmounts(charges, []).charges
    expect(allocate("payment", 30_000, open)).toEqual({
      allocations: [
        { fromEntryId: "payment", toEntryId: "dues-oct", amountCents: 25_000 },
        { fromEntryId: "payment", toEntryId: "fine", amountCents: 5000 }
      ],
      leftCents: 0
    })
    expect(allocate("payment", 70_000, open).leftCents).toBe(10_000)
  })

  it("pays only the charges picked", () => {
    const open = openAmounts(charges, []).charges
    expect(allocate("payment", 10_000, open, ["fine"]).allocations).toEqual([
      { fromEntryId: "payment", toEntryId: "fine", amountCents: 10_000 }
    ])
  })

  it("pays a new charge from a credit waiting for it", () => {
    const payment = entry("payment", { kind: "payment", amountCents: -30_000, postedOn: "2026-09-20" })
    const paid: Allocation[] = [{ fromEntryId: "payment", toEntryId: "dues-oct", amountCents: 25_000 }]
    const { credits } = openAmounts([october, payment], paid)
    expect(credits.map(({ unspentCents }) => unspentCents)).toEqual([5000])
    expect(applyCredits(november, credits)).toEqual([
      { fromEntryId: "payment", toEntryId: "dues-nov", amountCents: 5000 }
    ])
  })
})

describe("reversing", () => {
  const payment = entry("payment", { kind: "payment", amountCents: -30_000, postedOn: "2026-10-15" })
  const paid: Allocation[] = [
    { fromEntryId: "payment", toEntryId: "dues-oct", amountCents: 25_000 },
    { fromEntryId: "payment", toEntryId: "fine", amountCents: 5000 }
  ]
  const entries = [...charges, payment]

  it("waives only what's unpaid on a charge", () => {
    expect(reversalOf("fine", "waive", entries, paid)).toEqual({
      amountCents: -5000,
      allocations: [{ fromEntryId: "waive", toEntryId: "fine", amountCents: 5000 }]
    })
    expect(() => reversalOf("dues-oct", "waive", entries, paid)).toThrow("It's paid already.")
  })

  it("undoes a returned payment, so the charges it paid are owed again", () => {
    const undone = reversalOf("payment", "returned", entries, paid)
    expect(undone.amountCents).toBe(30_000)
    const reversal = entry("returned", { kind: "reversal", amountCents: 30_000, reversesId: "payment" })
    const after = openAmounts([...entries, reversal], [...paid, ...undone.allocations])
    expect(after.charges.map(({ charge, openCents }) => [charge.id, openCents])).toEqual([
      ["dues-nov", 25_000],
      ["fine", 10_000],
      ["dues-oct", 25_000]
    ])
    expect(after.credits).toEqual([])
    expect(() => reversalOf("payment", "again", [...entries, reversal], paid)).toThrow("reversed already")
  })
})

it("reads as a statement, with the balance after each entry", () => {
  const payment = entry("payment", { kind: "payment", amountCents: -30_000, postedOn: "2026-10-15" })
  const entries = [...charges, payment]
  const lines = statementOf(entries, [{ fromEntryId: "payment", toEntryId: "dues-oct", amountCents: 25_000 }])
  expect(lines.map(({ entry: line, balanceCents, openCents }) => [line.id, balanceCents, openCents])).toEqual([
    ["dues-oct", 25_000, 0],
    ["dues-nov", 50_000, 25_000],
    ["fine", 60_000, 10_000],
    ["payment", 30_000, null]
  ])
  expect(balanceOf(entries)).toBe(30_000)
})
