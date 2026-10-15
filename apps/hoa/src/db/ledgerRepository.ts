import { and, eq, inArray, sql } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import { z } from "zod"
import {
  allocate,
  applyCredits,
  entryKinds,
  openAmounts,
  reversalOf,
  type Allocation,
  type LedgerEntry
} from "@/money/ledger"
import { chunk, insertChunks, runBatch } from "./batching"
import type { Database } from "./database"
import { ledgerAllocations, ledgerEntries } from "./schema"

// The ledger's records (docs/design/money.md): entries are only ever added, with the allocations that say what each
// payment, credit or reversal paid or undid. Every query is scoped to the organization.

const entrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  unitId: z.string(),
  kind: z.enum(entryKinds),
  amountCents: z.number().int(),
  postedOn: z.string(),
  dueOn: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string(),
  reference: z.string().nullable(),
  ruleKey: z.string().nullable(),
  rulebookId: z.string().nullable(),
  sourceType: z.enum(["violation", "schedule", "payment", "manual"]),
  sourceId: z.string().nullable(),
  reversesId: z.string().nullable(),
  postingKey: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string()
})

export type UnitLedger = { entries: LedgerEntry[]; allocations: Allocation[] }

/** A unit's entries and allocations. */
export async function getUnitLedger(db: Database, organizationId: string, unitId: string): Promise<UnitLedger> {
  const [entries, allocations] = await Promise.all([
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.organizationId, organizationId), eq(ledgerEntries.unitId, unitId))),
    db
      .select({
        fromEntryId: ledgerAllocations.fromEntryId,
        toEntryId: ledgerAllocations.toEntryId,
        amountCents: ledgerAllocations.amountCents
      })
      .from(ledgerAllocations)
      .where(and(eq(ledgerAllocations.organizationId, organizationId), eq(ledgerAllocations.unitId, unitId)))
  ])
  return { entries: entries.map((row) => entrySchema.parse(row)), allocations }
}

/** Every unit's entries and allocations, by unit. */
export async function getOrganizationLedgers(db: Database, organizationId: string) {
  const [entries, allocations] = await Promise.all([
    db.select().from(ledgerEntries).where(eq(ledgerEntries.organizationId, organizationId)),
    db
      .select({
        unitId: ledgerAllocations.unitId,
        fromEntryId: ledgerAllocations.fromEntryId,
        toEntryId: ledgerAllocations.toEntryId,
        amountCents: ledgerAllocations.amountCents
      })
      .from(ledgerAllocations)
      .where(eq(ledgerAllocations.organizationId, organizationId))
  ])
  const ledgers = new Map<string, UnitLedger>()
  for (const row of entries) {
    const ledger = ledgers.get(row.unitId) ?? { entries: [], allocations: [] }
    ledger.entries.push(entrySchema.parse(row))
    ledgers.set(row.unitId, ledger)
  }
  for (const { unitId, ...allocation } of allocations) {
    ledgers.get(unitId)?.allocations.push(allocation)
  }
  return ledgers
}

/** Each unit's balance, for the units that have entries. */
export async function unitBalances(db: Database, organizationId: string, unitIds?: readonly string[]) {
  const rows = await db
    .select({ unitId: ledgerEntries.unitId, balanceCents: sql<number>`sum(${ledgerEntries.amountCents})` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.organizationId, organizationId),
        unitIds ? inArray(ledgerEntries.unitId, [...unitIds]) : undefined
      )
    )
    .groupBy(ledgerEntries.unitId)
  return new Map(rows.map((row) => [row.unitId, Number(row.balanceCents)]))
}

export type NewEntry = Omit<LedgerEntry, "id" | "organizationId" | "unitId" | "createdAt" | "reversesId"> & {
  reversesId?: string | null
}

type Posting = { organizationId: string; unitId: string; now: string }

const entryRow = ({ organizationId, unitId, now }: Posting, entry: NewEntry): LedgerEntry => ({
  ...entry,
  id: crypto.randomUUID(),
  organizationId,
  unitId,
  reversesId: entry.reversesId ?? null,
  createdAt: now
})

function allocationStatements(db: Database, { organizationId, unitId, now }: Posting, allocations: Allocation[]) {
  const rows = allocations.map((allocation) => ({
    ...allocation,
    id: crypto.randomUUID(),
    organizationId,
    unitId,
    createdAt: now
  }))
  return insertChunks(ledgerAllocations, rows).map((group) => db.insert(ledgerAllocations).values(group))
}

/**
 * The statements that post a charge, paid at once from any credit the unit has waiting, to run in one batch with
 * whatever posts it (a sanction's event, say). Null when its posting key has posted already.
 */
export async function chargeStatements(
  db: Database,
  posting: Posting,
  charge: NewEntry
): Promise<{ id: string; statements: BatchItem<"sqlite">[] } | null> {
  if (charge.postingKey) {
    const posted = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.organizationId, posting.organizationId), eq(ledgerEntries.postingKey, charge.postingKey))
      )
      .get()
    if (posted) {
      return null
    }
  }
  const ledger = await getUnitLedger(db, posting.organizationId, posting.unitId)
  const row = entryRow(posting, { ...charge, kind: "charge" })
  const allocations = applyCredits(row, openAmounts(ledger.entries, ledger.allocations).credits)
  return {
    id: row.id,
    statements: [db.insert(ledgerEntries).values(row), ...allocationStatements(db, posting, allocations)]
  }
}

/** Posts a charge on its own. */
export async function postCharge(db: Database, posting: Posting, charge: NewEntry) {
  const posted = await chargeStatements(db, posting, charge)
  if (posted) {
    await runBatch(db, posted.statements)
  }
  return posted?.id ?? null
}

/**
 * Posts many charges at once, such as a schedule's dues for every unit: each paid at once from any credit its unit has
 * waiting, and none whose posting key has posted already. Reads the ledger once and writes in a few batched inserts,
 * so a run fits a Worker's limit on queries. Returns how many posted.
 */
export async function postCharges(
  db: Database,
  { organizationId, now }: { organizationId: string; now: string },
  charges: readonly (NewEntry & { unitId: string })[]
) {
  const keys = charges.flatMap((charge) => (charge.postingKey ? [charge.postingKey] : []))
  const posted = new Set<string>()
  for (const group of chunk(keys, 90)) {
    const rows = await db
      .select({ postingKey: ledgerEntries.postingKey })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.organizationId, organizationId), inArray(ledgerEntries.postingKey, group)))
    for (const row of rows) {
      if (row.postingKey) {
        posted.add(row.postingKey)
      }
    }
  }
  const fresh = charges.filter((charge) => !charge.postingKey || !posted.has(charge.postingKey))
  if (fresh.length === 0) {
    return 0
  }
  const ledgers = await getOrganizationLedgers(db, organizationId)
  const ledgerOf = (unitId: string) => {
    const ledger = ledgers.get(unitId) ?? { entries: [], allocations: [] }
    ledgers.set(unitId, ledger)
    return ledger
  }
  const rows: LedgerEntry[] = []
  const paid: (Allocation & { unitId: string })[] = []
  for (const { unitId, ...charge } of fresh) {
    const ledger = ledgerOf(unitId)
    const row = entryRow({ organizationId, unitId, now }, { ...charge, kind: "charge" })
    const applied = applyCredits(row, openAmounts(ledger.entries, ledger.allocations).credits)
    // Later charges in this run see what this one spent.
    ledger.entries.push(row)
    ledger.allocations.push(...applied)
    rows.push(row)
    paid.push(...applied.map((allocation) => ({ ...allocation, unitId })))
  }
  await runBatch(db, [
    ...insertChunks(ledgerEntries, rows).map((group) => db.insert(ledgerEntries).values(group)),
    ...insertChunks(
      ledgerAllocations,
      paid.map((allocation) => ({ ...allocation, id: crypto.randomUUID(), organizationId, createdAt: now }))
    ).map((group) => db.insert(ledgerAllocations).values(group))
  ])
  return rows.length
}

/** Posts a payment or credit, paying the oldest charges due first, or only the ones picked. */
export async function postPayment(db: Database, posting: Posting, payment: NewEntry, picked: string[] | null = null) {
  const ledger = await getUnitLedger(db, posting.organizationId, posting.unitId)
  const row = entryRow(posting, payment)
  const { allocations } = allocate(
    row.id,
    -row.amountCents,
    openAmounts(ledger.entries, ledger.allocations).charges,
    picked
  )
  await runBatch(db, [db.insert(ledgerEntries).values(row), ...allocationStatements(db, posting, allocations)])
  return row.id
}

/**
 * Reverses an entry: a charge's unpaid amount is waived; a payment or credit is undone in full, and the charges it paid
 * are owed again.
 */
export async function reverseEntry(
  db: Database,
  posting: Posting & { createdBy: string; postedOn: string },
  entryId: string,
  description: string
) {
  const ledger = await getUnitLedger(db, posting.organizationId, posting.unitId)
  const entry = ledger.entries.find((candidate) => candidate.id === entryId)
  const id = crypto.randomUUID()
  const reversal = reversalOf(entryId, id, ledger.entries, ledger.allocations)
  const row: LedgerEntry = {
    id,
    organizationId: posting.organizationId,
    unitId: posting.unitId,
    kind: "reversal",
    amountCents: reversal.amountCents,
    postedOn: posting.postedOn,
    dueOn: null,
    category: entry?.category ?? null,
    description,
    reference: null,
    ruleKey: entry?.ruleKey ?? null,
    rulebookId: entry?.rulebookId ?? null,
    sourceType: entry?.sourceType ?? "manual",
    sourceId: entry?.sourceId ?? null,
    reversesId: entryId,
    postingKey: null,
    createdBy: posting.createdBy,
    createdAt: posting.now
  }
  await runBatch(db, [db.insert(ledgerEntries).values(row), ...allocationStatements(db, posting, reversal.allocations)])
  return id
}
