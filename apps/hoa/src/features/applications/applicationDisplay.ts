import { match } from "ts-pattern"
import type { ApplicationFile, ApplicationStatus, decisionOutcomes } from "@/applications/application"
import type { Recommendation } from "@/review/reviewModel"
import type { Fact, FactValue, Outcome } from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import { amountText, documentName, readableLabel } from "../rulebook/rulebookRecords"

// Labels, groupings and value formats for the application pages.

export const statusLabels: Record<ApplicationStatus, string> = {
  draft: "Draft",
  reviewing: "Reviewing",
  reviewed: "Reviewed",
  submitted: "With the committee",
  "information-requested": "Information requested",
  decided: "Decided"
}

export const recommendationLabels: Record<Recommendation, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  "request-information": "More information needed",
  "refer-to-committee": "Refer to the committee",
  deny: "Deny"
}

export type DecisionOutcome = (typeof decisionOutcomes)[number]

export const outcomeLabels: Record<DecisionOutcome, string> = {
  approved: "Approved",
  "approved-with-conditions": "Approved with conditions",
  "approved-in-part": "Approved in part",
  disapproved: "Disapproved",
  "information-requested": "Information requested"
}

/** A group of findings by outcome, as the findings list heads it. */
export const findingLabels: Record<Outcome, string> = {
  "not-met": "Not met",
  "missing-information": "Missing information",
  committee: "For the committee",
  advisory: "Suggestions",
  pending: "Pending",
  met: "Met",
  exempt: "Exempt",
  "not-applicable": "Doesn't apply",
  available: "Available",
  blocked: "Blocked"
}

/** One finding's outcome, as a matrix cell names it. */
export const cellLabels: Record<Outcome, string> = {
  "not-met": "Not met",
  "missing-information": "Missing",
  committee: "Committee",
  advisory: "Suggestion",
  pending: "Pending",
  met: "Met",
  exempt: "Exempt",
  "not-applicable": "n/a",
  available: "Available",
  blocked: "Blocked"
}

export const fileStatusLabels: Record<ApplicationFile["status"], string> = {
  uploading: "Uploading",
  processing: "Read at the next review",
  ready: "Read",
  unreadable: "Couldn't be read"
}

/** Outcomes in the order people act on them. */
export const outcomeOrder: Outcome[] = [
  "not-met",
  "missing-information",
  "committee",
  "advisory",
  "pending",
  "met",
  "exempt",
  "not-applicable",
  "available",
  "blocked"
]

/** The outcomes that ask something of someone: a change, information, or the committee's decision. */
export const attentionOutcomes: ReadonlySet<Outcome> = new Set([
  "not-met",
  "missing-information",
  "committee",
  "advisory"
])

/** Files the homeowner uploaded, each with the pictures taken from it. */
export function packetFiles(files: readonly ApplicationFile[]) {
  return files
    .filter((file) => file.parentFileId === null)
    .map((file) => ({ file, pictures: files.filter((child) => child.parentFileId === file.id) }))
}

/** "Fence run" for `fence-run`: a term's label as a heading starts. */
export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * A term's key in words, for a term the page has no record of: "review fee" for
 * `architectural-application.review-fee`, its own part without the thing it belongs to.
 */
export const termKeyLabel = (termKey: string) => (termKey.split(".").at(-1) ?? termKey).replaceAll("-", " ")

/**
 * A rule's key in words, for a rule the page has no record of: "Photos (Guidelines 3.4.2)" for
 * `guidelines:3.4.2#photos`, so a reader never sees a key.
 */
export function ruleKeyLabel(ruleKey: string) {
  const [, document, provision, name] = /^([^:#]+):([^#]+)#(.+)$/.exec(ruleKey) ?? []
  if (!document || !provision || !name) {
    return ruleKey
  }
  return `${sentenceCase(name.replaceAll("-", " "))} (${documentName(document)} ${readableLabel(provision)})`
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

/** A fact's value in words: labels for terms and units, an entity by its label. */
export function factValueText(value: FactValue, vocabulary: Vocabulary, entityLabel: (id: string) => string) {
  return match(value)
    .with({ type: "quantity" }, (quantity) => amountText(quantity.value, quantity.unit, vocabulary))
    .with({ type: "number" }, (number) => String(number.value))
    .with({ type: "boolean" }, (boolean) => (boolean.value ? "Yes" : "No"))
    .with({ type: "value" }, (chosen) => (chosen.term ? vocabulary.label(chosen.term) : chosen.text))
    .with({ type: "date" }, (date) => dateFormat.format(new Date(`${date.value}T00:00:00Z`)))
    .with({ type: "date-time" }, (dateTime) => dateTimeFormat.format(new Date(dateTime.value)))
    .with({ type: "time" }, (time) => time.value)
    .with({ type: "schedule" }, (schedule) => [...schedule.weekly, ...schedule.annual].join(", ") || "A schedule")
    .with({ type: "text" }, (text) => text.value)
    .with({ type: "entity" }, (reference) => entityLabel(reference.entity))
    .exhaustive()
}

/** What a fact says: its value, "None" when the packet says there's none, or the readings it couldn't choose between. */
export function factText(fact: Fact, vocabulary: Vocabulary, entityLabel: (id: string) => string) {
  const text = (value: FactValue) => factValueText(value, vocabulary, entityLabel)
  if (fact.state === "absent") {
    return "None"
  }
  if (fact.value) {
    return text(fact.value)
  }
  return fact.candidates.length > 0 ? fact.candidates.map(text).join(" or ") : (fact.stated ?? "Not read")
}

export const factStateLabels: Record<Fact["state"], string | null> = {
  known: null,
  absent: null,
  conflicting: "Conflicting",
  uncertain: "Unsure"
}

/** "92%": a confidence or a match score. */
export const percent = (value: number) => `${Math.round(value * 100)}%`
