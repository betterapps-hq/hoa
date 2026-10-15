import { and, desc, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { frequencies, scheduleCategories, type DuesUnit, type Schedule } from "@/money/schedules"
import type { Database } from "./database"
import { assessmentSchedules, units } from "./schema"

// Dues and special assessments' schedules (docs/design/money.md, Dues), scoped to the organization.

const scheduleSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  category: z.enum(scheduleCategories),
  frequency: z.enum(frequencies),
  amountCents: z.number().int(),
  unitAmounts: z.record(z.string(), z.number().int()).nullable(),
  firstDueOn: z.string(),
  lastDueOn: z.string().nullable(),
  postsFrom: z.string(),
  status: z.enum(["active", "ended"]),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

/** The association's schedules, active first, newest first. */
export async function listSchedules(db: Database, organizationId: string): Promise<Schedule[]> {
  const rows = await db
    .select()
    .from(assessmentSchedules)
    .where(eq(assessmentSchedules.organizationId, organizationId))
    .orderBy(desc(assessmentSchedules.createdAt))
  return rows
    .map((row) => scheduleSchema.parse(row))
    .toSorted((a, b) => Number(a.status !== "active") - Number(b.status !== "active"))
}

export async function insertSchedule(db: Database, schedule: Schedule) {
  await db.insert(assessmentSchedules).values(schedule)
}

/** Stops a schedule posting charges; what it posted stays on the ledger. */
export async function endSchedule(db: Database, organizationId: string, id: string, now: string) {
  await db
    .update(assessmentSchedules)
    .set({ status: "ended", updatedAt: now })
    .where(and(eq(assessmentSchedules.organizationId, organizationId), eq(assessmentSchedules.id, id)))
}

/** The units on the roll, each with the day it was added: dues post to a unit from then. */
export async function duesUnits(db: Database, organizationId: string): Promise<DuesUnit[]> {
  const rows = await db
    .select({ id: units.id, createdAt: units.createdAt })
    .from(units)
    .where(and(eq(units.organizationId, organizationId), isNull(units.removedAt)))
  return rows.map((row) => ({ id: row.id, addedOn: row.createdAt.slice(0, 10) }))
}
