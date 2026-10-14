import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import { getUnitLedger, postCharge, postPayment, reverseEntry, unitBalances } from "@/db/ledgerRepository"
import { getRoll } from "@/db/peopleRepository"
import { listSchedules } from "@/db/scheduleRepository"
import { doesWorkOf } from "@/features/role/roles"
import { ownedUnits, publishedRules, todayIn } from "@/features/violations/violations.server"
import { addDays } from "@/lib/days"
import { optionalText } from "@/lib/fields"
import {
  chargeCategories,
  chargeCategoryLabels,
  paymentMethodLabels,
  paymentMethods,
  statementOf,
  type EntryKind,
  type PaymentMethod
} from "@/money/ledger"
import { amountFor, dueDays, postingKeyOf, postsDaysAhead } from "@/money/schedules"
import { isCurrent } from "@/people/people"
import { addressLine } from "@/places/address"
import { getRequestContext, requireWorkOf, type RequestContext } from "@/session/requestContext.server"

// The ledger (docs/design/money.md): every unit's balance for the board, an owner's own units for them; the board
// records payments and credits, adds charges, and reverses entries.

export type LedgerUnit = { id: string; label: string; detail: string | null; owners: string[]; balanceCents: number }

export type LedgerLine = {
  id: string
  kind: EntryKind
  postedOn: string
  dueOn: string | null
  /** What it is: its category, or how it was paid. */
  label: string
  description: string
  amountCents: number
  balanceCents: number
  /** What's left to pay on a charge; null for anything else. */
  openCents: number | null
  isReversed: boolean
  /** The violation it came from, for a fine. */
  violationId: string | null
  canReverse: boolean
}

/** A dues charge coming due in the next few months: posted already (owed or paid), or the day it posts. */
export type ComingDue = {
  key: string
  name: string
  dueOn: string
  amountCents: number
  postsOn: string
  state: "posts" | "owed" | "paid"
}

export type UnitLedgerView = {
  unit: { id: string; label: string; address: string | null }
  owners: string[]
  balanceCents: number
  /** Newest first. */
  lines: LedgerLine[]
  /** Soonest first. */
  comingDue: ComingDue[]
  today: string
  canManage: boolean
}

/** Whether a dues charge has posted, and if so whether it's paid, from what's open on it once posted. */
function comingDueState(openCents: number | undefined): ComingDue["state"] {
  if (openCents === undefined) {
    return "posts"
  }
  return openCents > 0 ? "owed" : "paid"
}

/** How far ahead a ledger shows dues coming due. */
const comingDueDays = 90

const managesLedger = (context: RequestContext) => doesWorkOf(context.role, context.committees, "board")

async function ledgerContext() {
  const context = await getRequestContext()
  const organizationId = context.organization.id
  const [roll, published] = await Promise.all([getRoll(getDb(), organizationId), publishedRules(organizationId)])
  const today = todayIn(published?.rulesFile ?? null)
  const canManage = managesLedger(context)
  const owned = ownedUnits(roll, context.person?.id, today)
  const ownersOf = (unitId: string) =>
    roll.links
      .filter((link) => link.unitId === unitId && link.relation === "owner" && isCurrent(link, today))
      .flatMap((link) => roll.people.find((person) => person.id === link.personId)?.name ?? [])
  return { context, organizationId, roll, today, canManage, owned, ownersOf }
}

/** The units whose ledgers the requester may see, with their balances. */
export const listLedgers = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId, roll, canManage, owned, ownersOf } = await ledgerContext()
  const units = roll.units.filter((unit) => canManage || owned.includes(unit.id))
  const balances = await unitBalances(getDb(), organizationId, canManage ? undefined : owned)
  return {
    canManage,
    units: units.map((unit): LedgerUnit => ({
      id: unit.id,
      label: unit.label,
      detail: addressLine(unit) || null,
      owners: ownersOf(unit.id),
      balanceCents: balances.get(unit.id) ?? 0
    }))
  }
})

const lineLabel = (kind: EntryKind, category: string | null) => {
  if (kind === "charge") {
    const charge = chargeCategories.find((value) => value === category)
    return charge ? chargeCategoryLabels[charge] : "Charge"
  }
  if (kind === "payment") {
    const method = paymentMethods.find((value) => value === category)
    return method ? `Payment, ${paymentMethodLabels[method].toLowerCase()}` : "Payment"
  }
  return kind === "credit" ? "Credit" : "Reversal"
}

/** A unit's ledger: each entry with the balance after it, newest first. */
export const getUnitLedgerView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ unitId: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<UnitLedgerView> => {
    const { organizationId, roll, today, canManage, owned, ownersOf } = await ledgerContext()
    const unit = roll.units.find((candidate) => candidate.id === data.unitId)
    if (!unit || (!canManage && !owned.includes(unit.id))) {
      throw new Error("That unit's ledger isn't one you can see.")
    }
    const db = getDb()
    const [ledger, schedules] = await Promise.all([
      getUnitLedger(db, organizationId, unit.id),
      listSchedules(db, organizationId)
    ])
    const lines = statementOf(ledger.entries, ledger.allocations)
    const posted = new Map(
      lines.flatMap(({ entry, openCents }) => (entry.postingKey ? [[entry.postingKey, openCents ?? 0] as const] : []))
    )
    return {
      unit: { id: unit.id, label: unit.label, address: addressLine(unit) || null },
      owners: ownersOf(unit.id),
      balanceCents: lines.at(-1)?.balanceCents ?? 0,
      lines: lines.toReversed().map(({ entry, balanceCents, openCents, isReversed }): LedgerLine => ({
        id: entry.id,
        kind: entry.kind,
        postedOn: entry.postedOn,
        dueOn: entry.dueOn,
        label: lineLabel(entry.kind, entry.category),
        description: entry.description,
        amountCents: entry.amountCents,
        balanceCents,
        openCents,
        isReversed,
        violationId: entry.sourceType === "violation" ? entry.sourceId : null,
        canReverse:
          canManage && entry.kind !== "reversal" && !isReversed && (entry.kind !== "charge" || (openCents ?? 0) > 0)
      })),
      comingDue: schedules
        .flatMap((schedule) =>
          schedule.status === "active"
            ? dueDays(
                schedule,
                today > schedule.postsFrom ? today : schedule.postsFrom,
                addDays(today, comingDueDays),
                3
              ).map((dueOn): ComingDue => {
                const key = postingKeyOf(schedule.id, unit.id, dueOn)
                const openCents = posted.get(key)
                return {
                  key,
                  name: schedule.name,
                  dueOn,
                  amountCents: amountFor(schedule, unit.id),
                  postsOn: addDays(dueOn, -postsDaysAhead),
                  state: comingDueState(openCents)
                }
              })
            : []
        )
        .toSorted((a, b) => a.dueOn.localeCompare(b.dueOn))
        .slice(0, 4),
      today,
      canManage
    }
  })

/** A unit the board is changing the ledger of, and today there. */
async function managedUnit(unitId: string) {
  const context = await requireWorkOf("board")
  const { roll, today } = await ledgerContext()
  if (!roll.units.some((unit) => unit.id === unitId)) {
    throw new Error("That unit isn't on the roll.")
  }
  return { context, today, posting: { organizationId: context.organization.id, unitId, now: new Date().toISOString() } }
}

const amountCents = z.number().int().positive("Give an amount above $0.")

/** Records a payment by check, cash or another way, paying the oldest charges due first. */
export const recordPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        unitId: z.string().min(1),
        amountCents,
        method: z.enum(paymentMethods),
        reference: optionalText(100),
        postedOn: z.iso.date()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { context, today, posting } = await managedUnit(data.unitId)
    if (data.postedOn > today) {
      throw new Error("That day hasn't come yet. Record it once it's paid.")
    }
    const method: PaymentMethod = data.method
    await postPayment(getDb(), posting, {
      kind: "payment",
      amountCents: -data.amountCents,
      postedOn: data.postedOn,
      dueOn: null,
      category: method,
      description: data.reference && method === "check" ? `Check ${data.reference}` : "Payment",
      reference: data.reference,
      ruleKey: null,
      rulebookId: null,
      sourceType: "manual",
      sourceId: null,
      postingKey: null,
      createdBy: context.user.id
    })
  })

/** Adds a charge by hand, such as a fee the documents allow that no schedule or violation posts. */
export const addCharge = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        unitId: z.string().min(1),
        amountCents,
        category: z.enum(chargeCategories),
        description: z.string().trim().min(1, "Say what it's for.").max(200),
        dueOn: z.iso.date()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { context, today, posting } = await managedUnit(data.unitId)
    await postCharge(getDb(), posting, {
      kind: "charge",
      amountCents: data.amountCents,
      postedOn: today,
      dueOn: data.dueOn,
      category: data.category,
      description: data.description,
      reference: null,
      ruleKey: null,
      rulebookId: null,
      sourceType: "manual",
      sourceId: null,
      postingKey: null,
      createdBy: context.user.id
    })
  })

/** Gives a unit a credit, which pays its oldest charges due first, or the next ones. */
export const giveCredit = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        unitId: z.string().min(1),
        amountCents,
        description: z.string().trim().min(1, "Say what it's for.").max(200)
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { context, today, posting } = await managedUnit(data.unitId)
    await postPayment(getDb(), posting, {
      kind: "credit",
      amountCents: -data.amountCents,
      postedOn: today,
      dueOn: null,
      category: null,
      description: data.description,
      reference: null,
      ruleKey: null,
      rulebookId: null,
      sourceType: "manual",
      sourceId: null,
      postingKey: null,
      createdBy: context.user.id
    })
  })

/** Reverses an entry: waives what's unpaid on a charge, or undoes a payment or credit, such as a returned check. */
export const reverseLedgerEntry = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        unitId: z.string().min(1),
        entryId: z.string().min(1),
        reason: z.string().trim().min(1, "Say why.").max(200)
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { context, today, posting } = await managedUnit(data.unitId)
    await reverseEntry(getDb(), { ...posting, createdBy: context.user.id, postedOn: today }, data.entryId, data.reason)
  })
