import type { CurePeriod, SanctionAmount } from "@/engine/sanctions"
import { dayText } from "@/lib/days"
import { sentenceCase } from "@/lib/text"
import type * as T from "@/schema/types"
import type { ProcedureStep } from "@/violations/evaluation"
import type { NoticeDelivery } from "@/violations/violation"
import type { EventView } from "./violations.server"

// How violations read on screen: amounts, the time to cure, sanctions and each step of the history.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** Cents as dollars: "$1,250.00". */
export const money = (cents: number) => usd.format(cents / 100)

export const sanctionTypeLabels: Record<T.Sanction["type"], string> = {
  fine: "Fine",
  "late-fee": "Late fee",
  interest: "Interest",
  charge: "Charge",
  suspension: "Suspension",
  "self-help": "Doing the work and charging for it",
  towing: "Towing",
  lien: "Lien",
  "legal-action": "Legal action",
  "record-notice": "A notice recorded against the lot",
  acceleration: "The whole balance due at once"
}

/** What a sanction comes to, in words; null when it isn't money. */
export function amountText(amount: SanctionAmount): string | null {
  if (amount.type === "none") {
    return null
  }
  if (amount.type === "unknown") {
    return `Its amount needs ${amount.needs.join(" and ") || "more information"}.`
  }
  if (amount.type === "set-by-imposer") {
    const caps = [
      amount.maxEach === null ? null : `up to ${money(amount.maxEach)} each time`,
      amount.maxTotal === null ? null : `${money(amount.maxTotal)} in all`
    ].filter((cap) => cap !== null)
    return caps.length > 0 ? `The board sets the amount, ${caps.join(" and ")}.` : "The board sets the amount."
  }
  const { each, repeats, total } = amount
  if (!repeats || repeats.periods === 0) {
    const adds = repeats ? `, then ${money(repeats.each)} a ${repeatUnit(repeats.every)} while it continues` : ""
    return `${money(each)}${adds}${total < each ? `, limited to ${money(total)}` : ""}.`
  }
  const periods = `${repeats.periods} ${repeatUnit(repeats.every)}${repeats.periods === 1 ? "" : "s"}`
  const uncapped = each + repeats.each * repeats.periods
  const capped = total < uncapped ? `, limited to ${money(total)}` : ""
  return `${money(each)}, plus ${money(repeats.each)} a ${repeatUnit(repeats.every)} for ${periods}: ${money(uncapped)}${capped}.`
}

const repeatUnits: Record<string, string> = {
  "calendar-day": "day",
  "business-day": "business day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year"
}

const repeatUnit = (every: T.Amount) =>
  every.value === 1
    ? (repeatUnits[every.unit] ?? every.unit)
    : `${every.value} ${repeatUnits[every.unit] ?? every.unit}`

/** The most a sanction allows now, less what's been imposed under it; null when there's no amount to cap. */
export function remainingCents(amount: SanctionAmount, imposedCents: number): number | null {
  if (amount.type === "fixed") {
    return Math.max(amount.total - imposedCents, 0)
  }
  if (amount.type === "set-by-imposer" && (amount.maxEach !== null || amount.maxTotal !== null)) {
    return Math.max(Math.min(amount.maxEach ?? Infinity, (amount.maxTotal ?? Infinity) - imposedCents), 0)
  }
  return null
}

const procedureStepTexts: Record<ProcedureStep, string> = {
  notice: "deliver the notice",
  hearing: "hold the hearing"
}

/** The board's steps a procedure the documents require still needs: "First, deliver the notice." */
export const firstStepsText = (steps: readonly ProcedureStep[]) =>
  `First, ${new Intl.ListFormat("en-US").format(steps.map((step) => procedureStepTexts[step]))}.`

/** Where a rule's time to cure stands, for the board or for the owner who answers for it. */
export function cureText(cure: CurePeriod, forOwner = false): string {
  switch (cure.status) {
    case "running":
      return forOwner
        ? `Correct it by ${dayText(cure.endsOn ?? "")}.`
        : `Can be cured through ${dayText(cure.endsOn ?? "")}.`
    case "not-started":
      return "The time to cure starts when the notice is delivered."
    case "cured":
      return `Cured on ${dayText(cure.curedOn ?? "")}, within the time to cure.`
    case "passed":
      return `The time to cure ended on ${dayText(cure.endsOn ?? "")}.`
    case "unknown":
      return `The time to cure needs ${cure.needs.join(" and ") || "more information"}.`
    case "none":
      return cure.reason
  }
}

const noticeTexts: Record<NoticeDelivery, string> = {
  email: "Notice sent by email",
  mail: "Notice sent by mail",
  posted: "Notice posted at the unit",
  hand: "Notice delivered by hand"
}

/** A step of the history in words. */
export function eventText(event: EventView): string {
  switch (event.kind) {
    case "reported":
      return "Reported"
    case "notice":
      return event.delivery ? noticeTexts[event.delivery] : "Notice delivered"
    case "reply":
      return `${event.by} replied`
    case "hearing-requested":
      return `${event.by} asked for a hearing`
    case "hearing-set":
      return event.hearing
        ? `Hearing set for ${dayText(event.hearing.on)}${event.hearing.place ? `, ${event.hearing.place}` : ""}`
        : "Hearing set"
    case "hearing-held":
      return "Hearing held"
    case "cured":
      return event.curedInTime === false ? "Corrected, after the time to cure" : "Corrected"
    case "sanction":
      return event.sanction
        ? `${event.sanction.title}${event.sanction.amountCents === null ? "" : `: ${money(event.sanction.amountCents)}`}`
        : "Sanction imposed"
    case "dismissed":
      return "Dismissed"
    case "closed":
      return "Closed"
    case "reopened":
      return "Reopened"
    case "note":
      return "Note"
    case "fact":
      if (!event.fact) {
        return "A fact stated"
      }
      return event.fact.value === null
        ? `${sentenceCase(event.fact.label)}: taken back`
        : `${sentenceCase(event.fact.label)}: ${event.fact.value}`
  }
}
