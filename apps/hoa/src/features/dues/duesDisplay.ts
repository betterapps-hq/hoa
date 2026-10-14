import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import type { Schedule } from "@/money/schedules"

// How dues read on screen.

export const categoryLabels: Record<Schedule["category"], string> = {
  dues: "Dues",
  "special-assessment": "Special assessment"
}

/** What each unit owes each time: "$350.00 a unit", and how many owe their own amount. */
export function amountText(amountCents: number, ownAmounts: number) {
  const each = `${money(amountCents)} a unit`
  if (ownAmounts === 0) {
    return each
  }
  return `${each}, ${ownAmounts === 1 ? "1 unit owes its own" : `${ownAmounts} units owe their own`}`
}

/** When it's due: "Due Nov 1, 2026", "From Nov 1, 2026", or "Nov 1, 2026 to Oct 1, 2027". */
export function periodText(schedule: Pick<Schedule, "frequency" | "firstDueOn" | "lastDueOn">) {
  if (schedule.frequency === "once") {
    return `Due ${dayText(schedule.firstDueOn)}`
  }
  return schedule.lastDueOn
    ? `${dayText(schedule.firstDueOn)} to ${dayText(schedule.lastDueOn)}`
    : `From ${dayText(schedule.firstDueOn)}`
}

/** How much of a due day's charges are paid, as a whole percentage. */
export const paidPercent = (collection: { chargedCents: number; paidCents: number }) =>
  collection.chargedCents > 0 ? Math.min(100, Math.round((collection.paidCents / collection.chargedCents) * 100)) : 100
