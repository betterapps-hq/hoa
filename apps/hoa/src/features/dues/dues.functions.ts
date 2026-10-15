import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import { getOrganizationLedgers } from "@/db/ledgerRepository"
import { getRoll } from "@/db/peopleRepository"
import { endSchedule, insertSchedule, listSchedules } from "@/db/scheduleRepository"
import { associationToday, postDues } from "@/jobs/postDues.server"
import { scheduleCollection, type Collection } from "@/money/collections"
import { amountFor, frequencies, nextDueOn, scheduleCategories, type Schedule } from "@/money/schedules"
import { requireWorkOf } from "@/session/requestContext.server"

// Dues and special assessments (docs/design/money.md, Dues): the board sets up each schedule, and its charges post to
// every unit's ledger 30 days before they're due.

export type ScheduleView = Schedule & {
  nextDueOn: string | null
  /** What every unit owes together each time it's due. */
  totalCents: number
  /** How many units owe their own amount. */
  ownAmounts: number
  /** How its latest due day is being paid; null before it has posted a charge. */
  collection: Collection | null
}

/** The association's schedules, with each one's next due day and collection, and the units for amounts that vary. */
export const getDues = createServerFn({ method: "GET" }).handler(async () => {
  const context = await requireWorkOf("board")
  const organizationId = context.organization.id
  const db = getDb()
  const [today, schedules, roll, ledgers] = await Promise.all([
    associationToday(organizationId),
    listSchedules(db, organizationId),
    getRoll(db, organizationId),
    getOrganizationLedgers(db, organizationId)
  ])
  const units = roll.units.map((unit) => ({ id: unit.id, label: unit.label }))
  return {
    today,
    schedules: schedules.map((schedule): ScheduleView => ({
      ...schedule,
      nextDueOn: nextDueOn(schedule, today),
      totalCents: units.reduce((total, unit) => total + amountFor(schedule, unit.id), 0),
      ownAmounts: Object.keys(schedule.unitAmounts ?? {}).length,
      collection: scheduleCollection(ledgers.values(), schedule.id, today)
    })),
    units
  }
})

const scheduleInput = z
  .object({
    name: z.string().trim().min(1, "Name it.").max(120),
    category: z.enum(scheduleCategories),
    frequency: z.enum(frequencies),
    amountCents: z.number().int().positive("Give an amount above $0."),
    unitAmounts: z.record(z.string(), z.number().int().nonnegative()).nullable(),
    firstDueOn: z.iso.date(),
    lastDueOn: z.iso.date().nullable()
  })
  .refine((input) => input.lastDueOn === null || input.lastDueOn >= input.firstDueOn, {
    message: "The last due day can't be before the first.",
    path: ["lastDueOn"]
  })
export type ScheduleInput = z.input<typeof scheduleInput>

/** Sets up a schedule, and posts whatever it has due to post now. */
export const createSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => scheduleInput.parse(data))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const organizationId = context.organization.id
    const db = getDb()
    const [today, roll] = await Promise.all([associationToday(organizationId), getRoll(db, organizationId)])
    const units = new Set(roll.units.map((unit) => unit.id))
    if (data.unitAmounts && Object.keys(data.unitAmounts).some((unitId) => !units.has(unitId))) {
      throw new Error("Each unit with its own amount should be on the roll.")
    }
    const now = new Date().toISOString()
    const schedule: Schedule = {
      ...data,
      id: crypto.randomUUID(),
      organizationId,
      postsFrom: today,
      status: "active",
      createdBy: context.user.id,
      createdAt: now,
      updatedAt: now
    }
    await insertSchedule(db, schedule)
    return { posted: await postDues(organizationId, [schedule]) }
  })

/** Stops a schedule posting charges; what it posted stays on the ledger. */
export const endDuesSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ scheduleId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    await endSchedule(getDb(), context.organization.id, data.scheduleId, new Date().toISOString())
  })
