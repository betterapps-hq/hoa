// A unit's ledger (docs/design/money.md): charges, payments, credits and reversals, never edited, with allocations
// saying which charges each payment or credit paid. A payment or credit pays the oldest charge due first; what it
// doesn't pay waits for the next charge.

export const entryKinds = ["charge", "payment", "credit", "reversal"] as const
export type EntryKind = (typeof entryKinds)[number]

export const chargeCategories = ["dues", "special-assessment", "fine", "late-fee", "interest", "fee"] as const
export type ChargeCategory = (typeof chargeCategories)[number]

export const chargeCategoryLabels: Record<ChargeCategory, string> = {
  dues: "Dues",
  "special-assessment": "Special assessment",
  fine: "Fine",
  "late-fee": "Late fee",
  interest: "Interest",
  fee: "Fee"
}

export const paymentMethods = ["card", "bank", "check", "cash", "other"] as const
export type PaymentMethod = (typeof paymentMethods)[number]

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  card: "Card",
  bank: "Bank account",
  check: "Check",
  cash: "Cash",
  other: "Other"
}

export type SourceType = "violation" | "schedule" | "payment" | "manual"

export type LedgerEntry = {
  id: string
  organizationId: string
  unitId: string
  kind: EntryKind
  /** What it does to the balance, in cents: a charge adds, a payment or credit takes off, a reversal undoes. */
  amountCents: number
  postedOn: string
  dueOn: string | null
  category: string | null
  description: string
  reference: string | null
  ruleKey: string | null
  rulebookId: string | null
  sourceType: SourceType
  sourceId: string | null
  reversesId: string | null
  postingKey: string | null
  createdBy: string
  createdAt: string
}

export type Allocation = { fromEntryId: string; toEntryId: string; amountCents: number }

/** Charges by when they're due, then when they posted; payments and credits by when they posted. */
const byDue = (a: LedgerEntry, b: LedgerEntry) =>
  (a.dueOn ?? a.postedOn).localeCompare(b.dueOn ?? b.postedOn) ||
  a.postedOn.localeCompare(b.postedOn) ||
  a.createdAt.localeCompare(b.createdAt)

/** What's left to pay on each charge, and to spend of each payment or credit. */
export function openAmounts(entries: readonly LedgerEntry[], allocations: readonly Allocation[]) {
  const reversed = new Set(entries.flatMap((entry) => (entry.reversesId ? [entry.reversesId] : [])))
  const paidTo = new Map<string, number>()
  const spentFrom = new Map<string, number>()
  for (const allocation of allocations) {
    paidTo.set(allocation.toEntryId, (paidTo.get(allocation.toEntryId) ?? 0) + allocation.amountCents)
    spentFrom.set(allocation.fromEntryId, (spentFrom.get(allocation.fromEntryId) ?? 0) + allocation.amountCents)
  }
  const charges = entries
    .filter((entry) => entry.kind === "charge")
    .map((charge) => ({ charge, openCents: charge.amountCents - (paidTo.get(charge.id) ?? 0) }))
  const credits = entries
    .filter((entry) => (entry.kind === "payment" || entry.kind === "credit") && !reversed.has(entry.id))
    .map((credit) => ({ credit, unspentCents: -credit.amountCents - (spentFrom.get(credit.id) ?? 0) }))
  return { charges, credits, reversed }
}

/**
 * Pays charges from an amount, the oldest due first, or only the ones picked: the allocations, and what's left over.
 */
export function allocate(
  fromEntryId: string,
  amountCents: number,
  open: readonly { charge: LedgerEntry; openCents: number }[],
  picked: readonly string[] | null = null
) {
  const allocations: Allocation[] = []
  let left = amountCents
  const payable = open
    .filter(({ openCents, charge }) => openCents > 0 && (picked === null || picked.includes(charge.id)))
    .toSorted((a, b) => byDue(a.charge, b.charge))
  for (const { charge, openCents } of payable) {
    if (left <= 0) {
      break
    }
    const paid = Math.min(left, openCents)
    allocations.push({ fromEntryId, toEntryId: charge.id, amountCents: paid })
    left -= paid
  }
  return { allocations, leftCents: left }
}

/** Pays a new charge from what earlier payments and credits haven't spent, the oldest first. */
export function applyCredits(
  charge: LedgerEntry,
  credits: readonly { credit: LedgerEntry; unspentCents: number }[]
): Allocation[] {
  const allocations: Allocation[] = []
  let owed = charge.amountCents
  for (const { credit, unspentCents } of credits.toSorted((a, b) => byDue(a.credit, b.credit))) {
    if (owed <= 0) {
      break
    }
    const paid = Math.min(owed, unspentCents)
    if (paid > 0) {
      allocations.push({ fromEntryId: credit.id, toEntryId: charge.id, amountCents: paid })
      owed -= paid
    }
  }
  return allocations
}

/**
 * What reversing an entry posts: a charge's unpaid amount waived, paying it off; or a payment or credit undone in full,
 * taking back what it paid so those charges are owed again.
 */
export function reversalOf(
  entryId: string,
  reversalId: string,
  entries: readonly LedgerEntry[],
  allocations: readonly Allocation[]
): { amountCents: number; allocations: Allocation[] } {
  const entry = entries.find((candidate) => candidate.id === entryId)
  if (!entry || entry.kind === "reversal") {
    throw new Error("That entry can't be reversed.")
  }
  if (entries.some((candidate) => candidate.reversesId === entryId)) {
    throw new Error("It's been reversed already.")
  }
  if (entry.kind === "charge") {
    const openCents =
      openAmounts(entries, allocations).charges.find(({ charge }) => charge.id === entryId)?.openCents ?? 0
    if (openCents <= 0) {
      throw new Error("It's paid already. Give a credit instead.")
    }
    return {
      amountCents: -openCents,
      allocations: [{ fromEntryId: reversalId, toEntryId: entryId, amountCents: openCents }]
    }
  }
  return {
    amountCents: -entry.amountCents,
    allocations: allocations
      .filter((allocation) => allocation.fromEntryId === entryId)
      .map((allocation) => ({
        fromEntryId: reversalId,
        toEntryId: allocation.toEntryId,
        amountCents: -allocation.amountCents
      }))
  }
}

/** A unit's balance: what it owes, less any credit waiting for the next charge (a negative balance). */
export const balanceOf = (entries: readonly LedgerEntry[]) =>
  entries.reduce((total, entry) => total + entry.amountCents, 0)

/** The ledger as a statement: each entry in order with the balance after it, and what's still open on each charge. */
export function statementOf(entries: readonly LedgerEntry[], allocations: readonly Allocation[]) {
  const { charges, reversed } = openAmounts(entries, allocations)
  const open = new Map(charges.map(({ charge, openCents }) => [charge.id, openCents]))
  let balance = 0
  return entries
    .toSorted((a, b) => a.postedOn.localeCompare(b.postedOn) || a.createdAt.localeCompare(b.createdAt))
    .map((entry) => {
      balance += entry.amountCents
      return {
        entry,
        balanceCents: balance,
        openCents: open.get(entry.id) ?? null,
        isReversed: reversed.has(entry.id)
      }
    })
}
