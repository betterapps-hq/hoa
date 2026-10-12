import { match } from "ts-pattern"
import { sentenceCase } from "@/lib/text"
import { coreTerms } from "@/schema/coreTerms"
import { describeCondition } from "@/schema/describe"
import { isLaw } from "@/schema/law"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// The settings tab (encoding.md, UX, Settings): each clause as a form in plain words, with its citations.

type Clauses = T.Settings["clauses"]
export type ClauseName = keyof Clauses

/** Each kind of governing document by the name an owner knows it by, saying whose it is where that's unclear. */
const documentKindLabels: Record<T.DocumentKind, string> = {
  "federal-law": "Federal laws",
  "state-law": "State laws",
  "county-ordinance": "County ordinances",
  "city-ordinance": "City ordinances",
  declaration: "Declaration (CC&Rs)",
  "supplemental-declaration": "Supplemental declarations",
  plat: "Plat (the recorded map of the lots)",
  articles: "Articles of incorporation",
  bylaws: "Bylaws",
  rules: "Rules and regulations",
  policy: "Board policies",
  "design-guidelines": "Design guidelines",
  resolution: "Board resolutions",
  minutes: "Meeting minutes",
  decision: "Committee decisions"
}

export const documentKindLabel = (kind: T.DocumentKind) => documentKindLabels[kind]

const ordinals = new Intl.PluralRules("en-US", { type: "ordinal" })
const suffixes: Record<Intl.LDMLPluralRule, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
  zero: "th",
  many: "th"
}

/** "1st", "2nd", "3rd", "4th": a rank as people say it. */
export const ordinal = (n: number) => `${n}${suffixes[ordinals.select(n)]}`

/**
 * Where a document is dropped: into a rank, equal to the documents there and last among them; beside one of them,
 * before or after it; or into the gap before a rank, alone.
 */
export type RankTarget =
  | { type: "rank"; index: number }
  | { type: "gap"; index: number }
  | { type: "beside"; kind: T.DocumentKind; side: "before" | "after" }

/** How many ranks at the top hold only law, and stay fixed there. */
export function lawRanks(order: readonly (readonly T.DocumentKind[])[]) {
  const index = order.findIndex((rank) => !rank.every(isLaw))
  return index === -1 ? order.length : index
}

/** Whether a document may go to a target: law stays where it is, and nothing goes into or above it. */
export function canPlace(order: readonly T.DocumentKind[][], kind: T.DocumentKind, target: RankTarget) {
  return !isLaw(kind) && (target.type === "beside" ? !isLaw(target.kind) : target.index >= lawRanks(order))
}

/**
 * Moves one document: into a rank (`index` of the rank) or into a rank of its own at a gap (`index` of the rank it
 * goes before; the number of ranks for the end). A rank left empty goes away; a move
 * `canPlace` refuses changes nothing.
 */
export function placeDocument(order: readonly T.DocumentKind[][], kind: T.DocumentKind, target: RankTarget) {
  if (!canPlace(order, kind, target) || (target.type === "beside" && target.kind === kind)) {
    return order.map((rank) => [...rank])
  }
  const next = order.map((rank) => rank.filter((item) => item !== kind))
  if (target.type === "beside") {
    const rank = next.find((items) => items.includes(target.kind))
    rank?.splice(rank.indexOf(target.kind) + (target.side === "after" ? 1 : 0), 0, kind)
  } else if (target.type === "rank") {
    next[target.index]?.push(kind)
  } else {
    next.splice(target.index, 0, [kind])
  }
  return next.filter((rank) => rank.length > 0)
}

/** The units a number of days can be counted in. */
export const dayUnits = ["calendar-day", "business-day"] as const

export const holidayLabels: Record<string, string> = { "us-federal": "US federal holidays" }

/** "Pacific time (America/Los_Angeles)", or the zone's own name when it has no short one. */
export function zoneLabel(zone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value
  return name ? `${name} (${zone})` : zone
}

type Choice = { value: T.TermKey; label: string }

/** Every term a clause can name: the organization's and the core ones, by key. */
function allTerms(terms: readonly TermContent[]) {
  return new Map<T.TermKey, TermContent>([...coreTerms, ...terms].map((term) => [term.key, term]))
}

const byLabel = (a: Choice, b: Choice) => a.label.localeCompare(b.label)

/** The parties that can decide a request or answer for someone: people, bodies and organizations. */
export function partyChoices(terms: readonly TermContent[], vocabulary: Vocabulary): Choice[] {
  return [...allTerms(terms).values()]
    .filter((term) => (term.kind === "thing" || term.kind === "category") && vocabulary.isParty(term.key))
    .map((term) => ({ value: term.key, label: sentenceCase(vocabulary.label(term.key)) }))
    .toSorted(byLabel)
}

/** The kinds of request someone decides: applications, appeals, assessments. */
export function requestChoices(terms: readonly TermContent[], vocabulary: Vocabulary): Choice[] {
  return [...allTerms(terms).values()]
    .filter((term) => term.kind === "thing" && term.nature === "request")
    .map((term) => ({ value: term.key, label: sentenceCase(vocabulary.label(term.key, true)) }))
    .toSorted(byLabel)
}

/** A choice for a key the lists don't hold, so a select still shows what's saved. */
export function withCurrent(choices: readonly Choice[], key: T.TermKey, vocabulary: Vocabulary) {
  return choices.some((choice) => choice.value === key)
    ? choices
    : [{ value: key, label: sentenceCase(vocabulary.label(key)) }, ...choices]
}

const link = (key: T.TermKey, plural = false) => `{{${key}${plural ? ":plural" : ""}}}`

function selection(value: T.RuleSelection) {
  if (Array.isArray(value)) {
    return value.length === 0 ? null : `except ${value.length === 1 ? "1 sanction" : `${value.length} sanctions`}`
  }
  return value.except.length > 0 || value.documents.length > 0 ? "except some sanctions" : null
}

/** What limits who answers for whom, in words with term links: when it applies, until when, and what it leaves out. */
export function liabilityLimits(liability: Clauses["liability"][number], vocabulary: Vocabulary): string[] {
  return [
    liability.appliesWhen
      ? `Only when ${describeCondition(liability.appliesWhen, vocabulary, { linkTerms: true })}.`
      : null,
    liability.until ? `Until the ${liability.until.path.map((key) => link(key)).join("’s ")}.` : null,
    selection(liability.except) ? `${sentenceCase(selection(liability.except) ?? "")}.` : null
  ].filter((line) => line !== null)
}

/** What a sanction needs first, in words with term links. */
export function preconditionText(precondition: Clauses["sanctionPreconditions"][number], vocabulary: Vocabulary) {
  const limit = selection(precondition.except)
  return `Before a fine or other sanction for ${precondition.requestTypes.map((key) => link(key, true)).join(" or ")}: ${describeCondition(precondition.condition, vocabulary, { linkTerms: true })}${limit ? `, ${limit}` : ""}.`
}

/** Each clause's name, as its card and the coverage views title it. */
export const clauseTitles: Record<ClauseName, string> = {
  precedence: "Which document wins",
  time: "Deadlines",
  liability: "Who answers for whom",
  cure: "Time to fix a violation",
  deciders: "Who decides each request",
  sanctionPreconditions: "Before a fine or other sanction"
}

/** A clause as sentences with term links, for the views that quote it beside a passage. */
export function describeClause(name: ClauseName, clauses: Clauses, vocabulary: Vocabulary): string[] {
  return match(name)
    .with("precedence", () =>
      clauses.precedence.order.map((rank, index) => `${index + 1}. ${rank.map(documentKindLabel).join(", ")}`)
    )
    .with("time", () => [
      `A number of days means ${link(clauses.time.days, true)}.`,
      clauses.time.rollForward
        ? "A deadline that falls on a weekend or holiday moves to the next business day."
        : "A deadline that falls on a weekend or holiday stays where it falls."
    ])
    .with("liability", () =>
      clauses.liability.length === 0
        ? ["Everyone answers only for themselves."]
        : clauses.liability.map(
            (item) => `The ${link(item.liable)} answers for the violations of the ${link(item.actor)}.`
          )
    )
    .with("cure", () =>
      clauses.cure
        ? [
            `A violation can be fixed within ${clauses.cure.value} ${link(clauses.cure.unit, clauses.cure.value !== 1)}.`
          ]
        : ["There's no default time to fix a violation."]
    )
    .with("deciders", () =>
      clauses.deciders.map((item) => `The ${link(item.party)} decides ${link(item.requestType, true)}.`)
    )
    .with("sanctionPreconditions", () =>
      clauses.sanctionPreconditions.map((item) => preconditionText(item, vocabulary))
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

/** A confidence threshold as a whole percent, and back. */
export const percentOf = (share: number) => Math.round(share * 100)
export const shareOf = (percent: number) => Math.min(100, Math.max(0, Math.round(percent))) / 100
