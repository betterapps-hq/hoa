import { z } from "zod"
import type * as T from "@/schema/types"

// Violations (docs/design/violations.md): what the feature keeps, and the facts its history gives the engine.

export const violationStatuses = ["open", "closed", "dismissed"] as const
export type ViolationStatus = (typeof violationStatuses)[number]

export const violationStatusLabels: Record<ViolationStatus, string> = {
  open: "Open",
  closed: "Closed",
  dismissed: "Dismissed"
}

/** The party someone is to the documents, for who answers for a violation. */
export const violationParties = ["owner", "occupant", "tenant", "guest"] as const
export type ViolationParty = (typeof violationParties)[number]

export const eventKinds = [
  "reported",
  "notice",
  "reply",
  "hearing-requested",
  "hearing-set",
  "hearing-held",
  "cured",
  "sanction",
  "dismissed",
  "closed",
  "reopened",
  "note",
  "fact"
] as const
export type EventKind = (typeof eventKinds)[number]

/** How a notice reached them. */
export const noticeDeliveries = ["email", "mail", "posted", "hand"] as const
export type NoticeDelivery = (typeof noticeDeliveries)[number]

export const noticeDeliveryLabels: Record<NoticeDelivery, string> = {
  email: "By email",
  mail: "By mail",
  posted: "Posted at the unit",
  hand: "By hand"
}

/** A fact the board states about a violation, for the documents that ask it: a date, yes or no, an amount or a choice. */
export const factValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("date"), value: z.iso.date() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("number"), value: z.number().int().nonnegative() }),
  z.object({ type: z.literal("quantity"), value: z.number().nonnegative(), unit: z.string() }),
  z.object({ type: z.literal("value"), term: z.string(), text: z.string() })
])
export type FactValue = z.infer<typeof factValueSchema>

/** What each kind of event carries besides its day and note. */
export const eventDetailSchemas = {
  reported: z.null(),
  notice: z.object({ delivery: z.enum(noticeDeliveries), to: z.array(z.string()) }),
  reply: z.object({ personId: z.string().nullable() }),
  "hearing-requested": z.object({ personId: z.string().nullable() }),
  "hearing-set": z.object({ hearingOn: z.iso.date(), place: z.string().nullable() }),
  "hearing-held": z.null(),
  // Whether it was cured within its time to cure; null when the documents gave it none.
  cured: z.object({ inTime: z.boolean().nullable() }),
  sanction: z.object({
    ruleKey: z.string(),
    enforced: z.string(),
    type: z.string(),
    amountCents: z.number().int().nonnegative().nullable()
  }),
  dismissed: z.null(),
  closed: z.null(),
  reopened: z.null(),
  note: z.null(),
  // A fact about it the documents ask, by its property; null takes the answer back.
  fact: z.object({ property: z.string(), value: factValueSchema.nullable() })
} satisfies Record<EventKind, z.ZodType>

export type EventDetails<K extends EventKind> = z.infer<(typeof eventDetailSchemas)[K]>

export type ViolationEvent = {
  id: string
  violationId: string
  kind: EventKind
  occurredOn: T.IsoDate
  note: string | null
  details: unknown
  recordedBy: string
  createdAt: string
}

/** An event's details as its kind defines them; null when they don't parse. */
export function detailsOf<K extends EventKind>(event: Pick<ViolationEvent, "kind" | "details">, kind: K) {
  if (event.kind !== kind) {
    return null
  }
  const parsed = eventDetailSchemas[kind].safeParse(event.details)
  return parsed.success ? (parsed.data as EventDetails<K>) : null
}

export type Violation = {
  id: string
  organizationId: string
  unitId: string
  title: string
  description: string | null
  observedOn: T.IsoDate
  status: ViolationStatus
  rulebookId: string
  reportedBy: string
  createdAt: string
  updatedAt: string
}

export type ViolationPerson = { personId: string; party: ViolationParty }

/** Reporting a violation: the unit, the rules it breaks, what was seen and when, and who did it when it's known. */
export const reportInputSchema = z.object({
  unitId: z.string().min(1, "Pick the unit."),
  ruleKeys: z.array(z.string().min(1)).min(1, "Pick at least one rule it breaks.").max(10),
  title: z.string().trim().min(1, "Say what was seen.").max(160),
  description: z
    .string()
    .trim()
    .max(4000)
    .transform((value) => value || null),
  observedOn: z.iso.date("Give the day it was seen."),
  actor: z.object({ personId: z.string().min(1), party: z.enum(["occupant", "tenant"]) }).nullable()
})
export type ReportInput = z.input<typeof reportInputSchema>

const first = (events: readonly ViolationEvent[], kind: EventKind) =>
  events
    .filter((event) => event.kind === kind)
    .toSorted(byOccurrence)
    .at(0)

const latest = (events: readonly ViolationEvent[], kind: EventKind) =>
  events
    .filter((event) => event.kind === kind)
    .toSorted(byOccurrence)
    .at(-1)

/** Events in the order they happened: by day, then by when they were recorded. */
export const byOccurrence = (a: Pick<ViolationEvent, "occurredOn" | "createdAt">, b: typeof a) =>
  a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt)

/**
 * The dates the documents' procedures turn on, from the history: the first notice (which starts the time to cure), the
 * first request for a hearing, the latest hearing held and the latest cure. A step that hasn't happened is absent: the
 * feature keeps every step, so silence means it didn't happen.
 */
export function stepDates(events: readonly ViolationEvent[]) {
  return {
    noticeDeliveredOn: first(events, "notice")?.occurredOn ?? null,
    hearingRequestedOn: first(events, "hearing-requested")?.occurredOn ?? null,
    hearingHeldOn: latest(events, "hearing-held")?.occurredOn ?? null,
    curedOn: latest(events, "cured")?.occurredOn ?? null
  }
}

/** The amounts already imposed for a violation, by sanction rule, in cents. */
export function imposedBySanction(events: readonly ViolationEvent[]) {
  const imposed = new Map<T.RuleKey, number>()
  for (const event of events) {
    const details = detailsOf(event, "sanction")
    if (details) {
      imposed.set(details.ruleKey, (imposed.get(details.ruleKey) ?? 0) + (details.amountCents ?? 0))
    }
  }
  return imposed
}

/** The facts the board has stated about a violation, the latest for each property; taken-back ones left out. */
export function statedFacts(events: readonly ViolationEvent[]) {
  const stated = new Map<T.TermKey, FactValue>()
  for (const event of events.toSorted(byOccurrence)) {
    const fact = detailsOf(event, "fact")
    if (fact?.value) {
      stated.set(fact.property, fact.value)
    } else if (fact) {
      stated.delete(fact.property)
    }
  }
  return stated
}
