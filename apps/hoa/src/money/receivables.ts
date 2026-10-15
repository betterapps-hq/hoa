import { chargeStates, type Ledger } from "./collections"

// What's owed to the association (docs/design/money.md, Who sees what): each unit's balance and what's past due, how
// late it is, and what was billed and collected month by month.

/** What's unpaid on charges, by how late it is: not due yet, then up to 30, 60 and 90 days late, then more. */
export type Aging = { current: number; late30: number; late60: number; late90: number; over90: number }

export const agingBuckets = [
  "current",
  "late30",
  "late60",
  "late90",
  "over90"
] as const satisfies readonly (keyof Aging)[]

const noAging = (): Aging => ({ current: 0, late30: 0, late60: 0, late90: 0, over90: 0 })

/** Days from one day to a later one. */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

function bucketOf(dueOn: string, today: string): keyof Aging {
  const late = daysBetween(dueOn, today)
  if (late <= 0) {
    return "current"
  }
  if (late <= 30) {
    return "late30"
  }
  if (late <= 60) {
    return "late60"
  }
  return late <= 90 ? "late90" : "over90"
}

/** A unit's balance, what's past due on it and since when, and what's unpaid by how late it is. */
export type Standing = { balanceCents: number; pastDueCents: number; pastDueSince: string | null; aging: Aging }

/** Where a unit's ledger stands today. A charge is past due the day after its due day. */
export function standingOf(ledger: Ledger, today: string): Standing {
  const aging = noAging()
  let pastDueSince: string | null = null
  for (const { charge, openCents } of chargeStates(ledger)) {
    if (openCents <= 0) {
      continue
    }
    const dueOn = charge.dueOn ?? charge.postedOn
    const bucket = bucketOf(dueOn, today)
    aging[bucket] += openCents
    if (bucket !== "current" && (pastDueSince === null || dueOn < pastDueSince)) {
      pastDueSince = dueOn
    }
  }
  return {
    balanceCents: ledger.entries.reduce((total, entry) => total + entry.amountCents, 0),
    pastDueCents: aging.late30 + aging.late60 + aging.late90 + aging.over90,
    pastDueSince,
    aging
  }
}

/** Every unit's aging together. */
export const totalAging = (standings: Iterable<Pick<Standing, "aging">>) => {
  const total = noAging()
  for (const { aging } of standings) {
    for (const bucket of agingBuckets) {
      total[bucket] += aging[bucket]
    }
  }
  return total
}

/** A month's charges by their due day, and the money paid in it less any that came back. */
export type MonthTotals = { month: string; billedCents: number; collectedCents: number }

/** The month a day is in: "2026-10". */
const monthOf = (day: string) => day.slice(0, 7)

/** The months through today's, oldest first: "2026-05" through "2026-10" for six. */
export function monthsThrough(today: string, count: number) {
  const [year = 0, month = 1] = today.split("-").map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1))
    return date.toISOString().slice(0, 7)
  })
}

/**
 * What was billed and collected each month through today's: charges by the month they're due, less what's waived;
 * payments by the month they posted, less any that were returned. Credits aren't money collected.
 */
export function monthlyTotals(ledgers: Iterable<Ledger>, today: string, count = 6): MonthTotals[] {
  const totals = new Map(monthsThrough(today, count).map((month) => [month, { billedCents: 0, collectedCents: 0 }]))
  for (const ledger of ledgers) {
    for (const { charge, waivedCents } of chargeStates(ledger)) {
      const month = totals.get(monthOf(charge.dueOn ?? charge.postedOn))
      if (month) {
        month.billedCents += charge.amountCents - waivedCents
      }
    }
    const payments = new Set(ledger.entries.filter((entry) => entry.kind === "payment").map((entry) => entry.id))
    for (const entry of ledger.entries) {
      const month = totals.get(monthOf(entry.postedOn))
      if (!month) {
        continue
      }
      if (entry.kind === "payment") {
        month.collectedCents -= entry.amountCents
      } else if (entry.kind === "reversal" && entry.reversesId !== null && payments.has(entry.reversesId)) {
        month.collectedCents -= entry.amountCents
      }
    }
  }
  return [...totals].map(([month, { billedCents, collectedCents }]) => ({ month, billedCents, collectedCents }))
}
