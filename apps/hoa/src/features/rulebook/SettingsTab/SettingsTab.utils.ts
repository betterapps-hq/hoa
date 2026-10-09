import { match } from "ts-pattern"
import type { RulebookRecords } from "@/rulebook/assemble"
import { isBlocking, reviewIssues } from "@/rulebook/review"
import { describeCondition } from "@/schema/describe"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import { settings as settingsSchema } from "@/schema/zod"
import { parseJson } from "../parseJson"
import { amountText } from "../rulebookRecords"
import type { Problem } from "../ruleProblems"

// The settings tab (encoding.md, UX, Settings): each clause in words, with term links for screens to render.

type Clauses = T.Settings["clauses"]
export type ClauseName = keyof Clauses

export const clauseNames: ClauseName[] = [
  "precedence",
  "time",
  "liability",
  "cure",
  "deciders",
  "sanctionPreconditions"
]

export const clauseTitles: Record<ClauseName, string> = {
  precedence: "Which document wins",
  time: "Days and time",
  liability: "Who answers for whom",
  cure: "The default cure period",
  deciders: "Who decides each request",
  sanctionPreconditions: "What sanctions need first"
}

const link = (key: T.TermKey, plural = false) => `{{${key}${plural ? ":plural" : ""}}}`
const words = (key: string) => key.replaceAll("-", " ")

function selection(value: T.RuleSelection) {
  if (Array.isArray(value)) {
    return value.length === 0 ? "" : `, except ${value.length} sanctions`
  }
  return value.except.length > 0 || value.documents.length > 0 ? ", except some sanctions" : ""
}

/** The clause as sentences, with term links. */
export function describeClause(name: ClauseName, clauses: Clauses, vocabulary: Vocabulary): string[] {
  const condition = (value: T.Condition) => describeCondition(value, vocabulary, { linkTerms: true })
  return match(name)
    .with("precedence", () =>
      clauses.precedence.order.map((rank, index) => `${index + 1}. ${rank.map(words).join(", ")}`)
    )
    .with("time", () => {
      const { time } = clauses
      return [
        `An unqualified number of days means ${link(time.days, true)}.`,
        time.rollForward
          ? "A deadline on a weekend or holiday rolls to the next business day."
          : "A deadline on a weekend or holiday doesn't roll forward.",
        `Holidays follow the ${time.holidays} calendar, in the ${time.zone} time zone.`
      ]
    })
    .with("liability", () =>
      clauses.liability.length === 0
        ? ["No one answers for anyone else."]
        : clauses.liability.map((liability) => {
            const when = liability.appliesWhen ? ` when ${condition(liability.appliesWhen)}` : ""
            return `The ${link(liability.liable)} answers for the ${link(liability.actor)}${when}${selection(liability.except)}.`
          })
    )
    .with("cure", () =>
      clauses.cure
        ? [
            `A violation can be cured within ${amountText(clauses.cure.value, clauses.cure.unit, vocabulary)} of the ${clauses.cure.after.path.map((key) => link(key)).join("’s ")}.`
          ]
        : ["There's no default cure period."]
    )
    .with("deciders", () =>
      clauses.deciders.map((decider) => `The ${link(decider.party)} decides ${link(decider.requestType, true)}.`)
    )
    .with("sanctionPreconditions", () =>
      clauses.sanctionPreconditions.map(
        (precondition) =>
          `Sanctions in ${precondition.requestTypes.map((key) => link(key, true)).join(" and ")} need first that ${condition(precondition.condition)}${selection(precondition.except)}.`
      )
    )
    .exhaustive()
}

/** Every citation a clause holds. */
export function clauseCitations(name: ClauseName, clauses: Clauses): T.Citation[] {
  return match(name)
    .with("precedence", () => clauses.precedence.citations)
    .with("time", () => clauses.time.citations)
    .with("liability", () => clauses.liability.flatMap((item) => item.citations))
    .with("cure", () => clauses.cure?.citations ?? [])
    .with("deciders", () => clauses.deciders.flatMap((item) => item.citations))
    .with("sanctionPreconditions", () => clauses.sanctionPreconditions.flatMap((item) => item.citations))
    .exhaustive()
}

/** A clause typed as JSON, checked by the settings' Zod and against the rest of the rulebook. */
export function checkClause(records: RulebookRecords, name: ClauseName, text: string) {
  const json = parseJson(text)
  if (json.error !== null) {
    return { clauses: null, problems: [{ path: "", message: json.error, isBlocking: true }] }
  }
  const parsed = settingsSchema.shape.clauses.safeParse({ ...records.settings.clauses, [name]: json.value })
  if (!parsed.success) {
    return {
      clauses: null,
      problems: parsed.error.issues.map((issue): Problem => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
        isBlocking: true
      }))
    }
  }
  const found =
    reviewIssues({ ...records, settings: { ...records.settings, clauses: parsed.data } }).get("settings") ?? []
  return {
    clauses: parsed.data,
    problems: found
      .filter((issue) => issue.path[1] === name)
      .map((issue): Problem => ({
        path: issue.path.join("."),
        message: issue.message,
        isBlocking: isBlocking(issue.code)
      }))
  }
}
