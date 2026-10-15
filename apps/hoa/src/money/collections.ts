import type { Allocation, LedgerEntry } from "./ledger"

// How charges are being paid (docs/design/money.md): each charge's paid and waived amounts, and a dues schedule's
// collection for a due day across the units it charged.

/** A unit's ledger: its entries, and which charges each payment, credit or reversal paid or undid. */
export type Ledger = { entries: readonly LedgerEntry[]; allocations: readonly Allocation[] }

/** A charge, what's been paid of it, and what's been waived (its own reversal); the rest is still owed. */
export type ChargeState = { charge: LedgerEntry; paidCents: number; waivedCents: number; openCents: number }

/** Each charge on a ledger, with what's been paid and waived of it. */
export function chargeStates({ entries, allocations }: Ledger): ChargeState[] {
  const reversing = new Map(entries.flatMap((entry) => (entry.reversesId ? [[entry.id, entry.reversesId]] : [])))
  return entries
    .filter((entry) => entry.kind === "charge")
    .map((charge) => {
      let paidCents = 0
      let waivedCents = 0
      for (const allocation of allocations) {
        if (allocation.toEntryId !== charge.id) {
          continue
        }
        if (reversing.get(allocation.fromEntryId) === charge.id) {
          waivedCents += allocation.amountCents
        } else {
          paidCents += allocation.amountCents
        }
      }
      return { charge, paidCents, waivedCents, openCents: charge.amountCents - paidCents - waivedCents }
    })
}

/** A schedule's charges for one due day: what they came to, less any waived, what's been paid, and how many units. */
export type Collection = { dueOn: string; chargedCents: number; paidCents: number; units: number; paidUnits: number }

/**
 * How a schedule's latest due day is being paid: the last one due by today, or before any is, the first one posted.
 * Null before it has posted a charge.
 */
export function scheduleCollection(ledgers: Iterable<Ledger>, scheduleId: string, today: string): Collection | null {
  const states = [...ledgers].flatMap((ledger) =>
    chargeStates(ledger).filter(
      ({ charge }) => charge.sourceType === "schedule" && charge.sourceId === scheduleId && charge.dueOn !== null
    )
  )
  const dueDays = [...new Set(states.flatMap(({ charge }) => (charge.dueOn ? [charge.dueOn] : [])))].toSorted()
  const dueOn = dueDays.findLast((day) => day <= today) ?? dueDays.at(0)
  if (dueOn === undefined) {
    return null
  }
  const due = states.filter(({ charge }) => charge.dueOn === dueOn && charge.amountCents > 0)
  return {
    dueOn,
    chargedCents: due.reduce((total, state) => total + state.charge.amountCents - state.waivedCents, 0),
    paidCents: due.reduce((total, state) => total + state.paidCents, 0),
    units: due.length,
    paidUnits: due.filter((state) => state.openCents <= 0).length
  }
}
