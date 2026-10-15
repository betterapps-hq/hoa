import * as C from "@/engine/calendar"
import { addDays } from "@/lib/days"

// Dues and special assessments (docs/design/money.md, Dues): each schedule's due days, and the charges a daily job
// posts for them, each 30 days before it's due, once per unit and due day.

export const frequencies = ["once", "monthly", "quarterly", "semiannual", "annual"] as const
export type Frequency = (typeof frequencies)[number]

export const frequencyLabels: Record<Frequency, string> = {
  once: "Once",
  monthly: "Every month",
  quarterly: "Every quarter",
  semiannual: "Twice a year",
  annual: "Every year"
}

const monthsApart: Record<Frequency, number> = { once: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }

export const scheduleCategories = ["dues", "special-assessment"] as const
export type ScheduleCategory = (typeof scheduleCategories)[number]

export type Schedule = {
  id: string
  organizationId: string
  name: string
  category: ScheduleCategory
  frequency: Frequency
  amountCents: number
  /** Units with their own amount, in cents; the rest owe `amountCents`. */
  unitAmounts: Record<string, number> | null
  firstDueOn: string
  lastDueOn: string | null
  /** The day it was set up: it never posts charges due before then. */
  postsFrom: string
  status: "active" | "ended"
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** How many days before it's due a charge posts. */
export const postsDaysAhead = 30

/** A schedule's due days from one day through another, in order; at most `limit` of them. */
export function dueDays(
  schedule: Pick<Schedule, "frequency" | "firstDueOn" | "lastDueOn">,
  from: string,
  through: string,
  limit = 1000
) {
  const months = monthsApart[schedule.frequency]
  const first = C.toDay(schedule.firstDueOn)
  const days: string[] = []
  for (let index = 0; days.length < limit; index += 1) {
    const day = C.fromDay(C.addMonths(first, months * index))
    if (day > through || (schedule.lastDueOn !== null && day > schedule.lastDueOn)) {
      break
    }
    if (day >= from) {
      days.push(day)
    }
    if (months === 0) {
      break
    }
  }
  return days
}

/** What a unit owes each time under a schedule, in cents. */
export const amountFor = (schedule: Pick<Schedule, "amountCents" | "unitAmounts">, unitId: string) =>
  schedule.unitAmounts?.[unitId] ?? schedule.amountCents

/** The key that posts a unit's charge for a due day once, however many times the job runs. */
export const postingKeyOf = (scheduleId: string, unitId: string, dueOn: string) =>
  `schedule:${scheduleId}:${unitId}:${dueOn}`

/** A unit dues post to, from the day it was added to the roll. */
export type DuesUnit = { id: string; addedOn: string }

/**
 * The charges an active schedule has posting by today: every due day from when it was set up, or the unit was added if
 * later, through 30 days ahead, for each unit. Posting keys keep a charge that's posted already from posting again.
 */
export function chargesDue(schedule: Schedule, units: readonly DuesUnit[], today: string) {
  if (schedule.status !== "active") {
    return []
  }
  return units.flatMap((unit) =>
    dueDays(
      schedule,
      unit.addedOn > schedule.postsFrom ? unit.addedOn : schedule.postsFrom,
      addDays(today, postsDaysAhead)
    ).map((dueOn) => ({
      unitId: unit.id,
      dueOn,
      amountCents: amountFor(schedule, unit.id),
      postingKey: postingKeyOf(schedule.id, unit.id, dueOn)
    }))
  )
}

/** The next due day on or after a day; null once the schedule is over. */
export const nextDueOn = (schedule: Schedule, from: string) =>
  schedule.status === "active" ? (dueDays(schedule, from, "9999-12-31", 1)[0] ?? null) : null
