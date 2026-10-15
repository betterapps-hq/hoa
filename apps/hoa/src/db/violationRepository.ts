import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import { z } from "zod"
import type { PriorViolation } from "@/violations/evaluation"
import {
  detailsOf,
  eventKinds,
  violationParties,
  violationStatuses,
  type EventKind,
  type Violation,
  type ViolationEvent,
  type ViolationPerson,
  type ViolationStatus
} from "@/violations/violation"
import type { Database } from "./database"
import { violationEvents, violationPeople, violationPhotos, violationRules, violations } from "./schema"

// Violations (docs/design/violations.md): each violation with the rules it breaks, who answers for it, its photos and
// its events. Every query is scoped to the organization.

const violationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  unitId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  observedOn: z.string(),
  status: z.enum(violationStatuses),
  rulebookId: z.string(),
  reportedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const eventSchema = z.object({
  id: z.string(),
  violationId: z.string(),
  kind: z.enum(eventKinds),
  occurredOn: z.string(),
  note: z.string().nullable(),
  details: z.unknown(),
  recordedBy: z.string(),
  createdAt: z.string()
})

export type ViolationPhoto = typeof violationPhotos.$inferSelect

/** A violation with everything it's made of. */
export type ViolationRecord = {
  violation: Violation
  ruleKeys: string[]
  people: ViolationPerson[]
  photos: ViolationPhoto[]
  events: ViolationEvent[]
}

export type NewEvent = { kind: EventKind; occurredOn: string; note: string | null; details: unknown }

const eventRow = (
  organizationId: string,
  violationId: string,
  event: NewEvent,
  recordedBy: string,
  now: string,
  id: string = crypto.randomUUID()
) => ({
  id,
  organizationId,
  violationId,
  kind: event.kind,
  occurredOn: event.occurredOn,
  note: event.note,
  details: event.details,
  recordedBy,
  createdAt: now
})

/** Reports a violation: it, its rules and people, and its first event, in one batch. */
export async function insertViolation(
  db: Database,
  input: Omit<Violation, "id" | "status" | "createdAt" | "updatedAt"> & {
    ruleKeys: readonly string[]
    people: readonly ViolationPerson[]
    now: string
  }
) {
  const { ruleKeys, people, now, ...fields } = input
  const id = crypto.randomUUID()
  const scoped = { organizationId: fields.organizationId, violationId: id }
  await db.batch([
    db.insert(violations).values({ ...fields, id, status: "open", createdAt: now, updatedAt: now }),
    db.insert(violationRules).values(ruleKeys.map((ruleKey) => ({ ...scoped, ruleKey }))),
    ...(people.length > 0
      ? [db.insert(violationPeople).values(people.map((person) => ({ ...scoped, ...person })))]
      : []),
    db
      .insert(violationEvents)
      .values(
        eventRow(
          fields.organizationId,
          id,
          { kind: "reported", occurredOn: fields.observedOn, note: null, details: null },
          fields.reportedBy,
          now
        )
      )
  ])
  return id
}

/** Violations with their parts, by id, in the order given. */
export async function getViolationRecords(
  db: Database,
  organizationId: string,
  ids: readonly string[]
): Promise<ViolationRecord[]> {
  if (ids.length === 0) {
    return []
  }
  const [rows, rules, people, photos, events] = await Promise.all([
    db
      .select()
      .from(violations)
      .where(and(eq(violations.organizationId, organizationId), inArray(violations.id, [...ids]))),
    db
      .select()
      .from(violationRules)
      .where(and(eq(violationRules.organizationId, organizationId), inArray(violationRules.violationId, [...ids]))),
    db
      .select()
      .from(violationPeople)
      .where(and(eq(violationPeople.organizationId, organizationId), inArray(violationPeople.violationId, [...ids]))),
    db
      .select()
      .from(violationPhotos)
      .where(and(eq(violationPhotos.organizationId, organizationId), inArray(violationPhotos.violationId, [...ids])))
      .orderBy(asc(violationPhotos.createdAt)),
    db
      .select()
      .from(violationEvents)
      .where(and(eq(violationEvents.organizationId, organizationId), inArray(violationEvents.violationId, [...ids])))
      .orderBy(asc(violationEvents.occurredOn), asc(violationEvents.createdAt))
  ])
  const byId = new Map(rows.map((row) => [row.id, violationSchema.parse(row)]))
  return ids.flatMap((id) => {
    const violation = byId.get(id)
    if (!violation) {
      return []
    }
    return [
      {
        violation,
        ruleKeys: rules.filter((rule) => rule.violationId === id).map((rule) => rule.ruleKey),
        people: people
          .filter((person) => person.violationId === id)
          .map((person) => ({ personId: person.personId, party: z.enum(violationParties).parse(person.party) })),
        photos: photos.filter((photo) => photo.violationId === id),
        events: events.filter((event) => event.violationId === id).map((event) => eventSchema.parse(event))
      }
    ]
  })
}

/** The ids of an organization's violations: open ones first, then the most recently observed. */
export async function listViolationIds(
  db: Database,
  organizationId: string,
  filter: { unitIds?: readonly string[]; personId?: string } = {}
) {
  const rows = await db
    .select({ id: violations.id, status: violations.status, unitId: violations.unitId })
    .from(violations)
    .where(eq(violations.organizationId, organizationId))
    .orderBy(desc(violations.observedOn), desc(violations.createdAt))
  const named = filter.personId
    ? new Set(
        (
          await db
            .select({ violationId: violationPeople.violationId })
            .from(violationPeople)
            .where(
              and(eq(violationPeople.organizationId, organizationId), eq(violationPeople.personId, filter.personId))
            )
        ).map((row) => row.violationId)
      )
    : null
  const units = filter.unitIds ? new Set(filter.unitIds) : null
  return rows
    .filter((row) => (!units && !named) || units?.has(row.unitId) || named?.has(row.id))
    .toSorted((a, b) => Number(a.status !== "open") - Number(b.status !== "open"))
    .map((row) => row.id)
}

/** Every violation, as the occurrences of a sanction count earlier ones. */
export async function violationHistory(db: Database, organizationId: string): Promise<PriorViolation[]> {
  const ids = (
    await db.select({ id: violations.id }).from(violations).where(eq(violations.organizationId, organizationId))
  ).map((row) => row.id)
  const records = await getViolationRecords(db, organizationId, ids)
  return records.map(({ violation, ruleKeys, people, events }) => ({
    id: violation.id,
    unitId: violation.unitId,
    observedOn: violation.observedOn,
    status: violation.status,
    ruleKeys,
    ownerIds: people.filter((person) => person.party === "owner").map((person) => person.personId),
    curedInTime: events.some((event) => detailsOf(event, "cured")?.inTime === true)
  }))
}

/** Adds an event, and sets the violation's status when it changes it, in one batch. */
export async function addViolationEvent(
  db: Database,
  input: {
    organizationId: string
    violationId: string
    event: NewEvent
    recordedBy: string
    status?: ViolationStatus
    now: string
    /** The event's id, when what it posts with it names it. */
    eventId?: string
    /** What lands with it, such as the charge a fine posts. */
    also?: BatchItem<"sqlite">[]
  }
) {
  const { organizationId, violationId, now } = input
  await db.batch([
    db
      .insert(violationEvents)
      .values(eventRow(organizationId, violationId, input.event, input.recordedBy, now, input.eventId)),
    db
      .update(violations)
      .set({ updatedAt: now, ...(input.status ? { status: input.status } : {}) })
      .where(and(eq(violations.organizationId, organizationId), eq(violations.id, violationId))),
    ...(input.also ?? [])
  ])
}

export async function insertViolationPhoto(db: Database, photo: ViolationPhoto) {
  await db.insert(violationPhotos).values(photo)
}

export async function getViolationPhoto(db: Database, organizationId: string, violationId: string, id: string) {
  const row = await db
    .select()
    .from(violationPhotos)
    .where(
      and(
        eq(violationPhotos.organizationId, organizationId),
        eq(violationPhotos.violationId, violationId),
        eq(violationPhotos.id, id)
      )
    )
    .get()
  return row ?? null
}
