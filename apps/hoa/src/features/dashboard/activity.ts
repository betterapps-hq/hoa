import type { Application } from "@/applications/application"
import type { AreaId } from "./areas"

// What happened across the HOA's areas, and who did it, for the dashboards (docs/dashboard.md, Recent activity).
// Events are read from the records' own dates and the ids of whoever acted, so an application's latest submission and
// decision are all that's known of it.

type DecisionOutcome = NonNullable<Application["decision"]>["outcome"]

/** An application as its events name it. */
type EventApplication = Pick<Application, "id" | "description"> & { projectTypeLabel: string | null }

/** A governing document upload as its events name it. */
type EventDocument = { id: string; title: string; version: number }

/** Something that happened in one of the HOA's areas. */
export type ActivityEvent = {
  /** Unique among the events. */
  id: string
  at: string
  /** Who did it, by name; null when the record doesn't say, or it was the reader. */
  by: string | null
} & (
  | { type: "application-submitted"; application: EventApplication; again: boolean }
  | { type: "application-decided"; application: EventApplication; outcome: DecisionOutcome }
  | { type: "project-type-added"; projectType: { id: string; label: string } }
  | { type: "rulebook-published"; version: number }
  | { type: "documents-added"; documents: EventDocument[] }
  | { type: "documents-removed"; documents: EventDocument[] }
)

/** The area each kind of event belongs to; a new kind names its area here, or it doesn't compile. */
const eventAreas = {
  "application-submitted": "architectural-review",
  "application-decided": "architectural-review",
  "project-type-added": "architectural-review",
  "rulebook-published": "rulebook",
  "documents-added": "rulebook",
  "documents-removed": "rulebook"
} as const satisfies Record<ActivityEvent["type"], AreaId>

/** The area of the HOA an event happened in. */
export const areaOf = (event: Pick<ActivityEvent, "type">): AreaId => eventAreas[event.type]

type DocumentUpload = EventDocument & {
  lineageId: string
  status: string
  uploadedBy: string
  uploadedAt: string
  removedBy: string | null
  removedAt: string | null
}

/** The records events are read from. */
export type ActivitySources = {
  /** The applications the reader sees, each with its project type's label (null for "Something else"). */
  applications: readonly (Pick<Application, "id" | "description" | "createdBy" | "submittedAt" | "decision"> & {
    projectTypeLabel: string | null
  })[]
  /** The project types whose adding is news to the reader. */
  projectTypes: readonly { id: string; label: string; createdBy: string | null; createdAt: string }[]
  /** The rulebooks that were published: the one in force and those it superseded. */
  rulebooks: readonly { id: string; version: number | null; publishedBy: string | null; publishedAt: string | null }[]
  /** Every governing document upload, removed ones too. */
  documents: readonly DocumentUpload[]
  /** A person's name, from the user id a record keeps; null for the reader, who needs no naming. */
  nameOf: (userId: string) => string | null
}

/** Who did something, by name, from the id its record keeps; null when it keeps none. */
type Namer = (userId: string | null) => string | null

/** Uploads or removals this close together are one batch, and one event: documents are often added several at once. */
const batchWindow = 15 * 60 * 1000

const newestFirst = (a: { at: string }, b: { at: string }) => Date.parse(b.at) - Date.parse(a.at)

/** What happened lately across the HOA's areas, newest first. */
export function recentActivity(sources: ActivitySources, limit = 8): ActivityEvent[] {
  const byName: Namer = (userId) => (userId === null ? null : sources.nameOf(userId))
  return [
    ...sources.applications.flatMap((application) => applicationEvents(application, byName)),
    ...sources.projectTypes.map((type): ActivityEvent => ({
      id: `project-type-added:${type.id}`,
      at: type.createdAt,
      by: byName(type.createdBy),
      type: "project-type-added",
      projectType: { id: type.id, label: type.label }
    })),
    ...sources.rulebooks.flatMap(({ id, version, publishedBy, publishedAt }): ActivityEvent[] =>
      version === null || publishedAt === null
        ? []
        : [
            {
              id: `rulebook-published:${id}`,
              at: publishedAt,
              by: byName(publishedBy),
              type: "rulebook-published",
              version
            }
          ]
    ),
    ...documentEvents(sources.documents, byName)
  ]
    .toSorted(newestFirst)
    .slice(0, limit)
}

function applicationEvents(application: ActivitySources["applications"][number], byName: Namer): ActivityEvent[] {
  const { id, description, projectTypeLabel, createdBy, submittedAt, decision } = application
  const subject = { id, description, projectTypeLabel }
  const events: ActivityEvent[] = []
  if (submittedAt !== null) {
    events.push({
      id: `application-submitted:${id}`,
      at: submittedAt,
      // Only the homeowner who made the application submits it.
      by: byName(createdBy),
      type: "application-submitted",
      application: subject,
      // Answering the committee's request submits it again; the request stays on record until the next decision.
      again: decision?.outcome === "information-requested" && Date.parse(decision.decidedAt) < Date.parse(submittedAt)
    })
  }
  if (decision !== null) {
    events.push({
      id: `application-decided:${id}`,
      at: decision.decidedAt,
      by: byName(decision.decidedBy),
      type: "application-decided",
      application: subject,
      outcome: decision.outcome
    })
  }
  return events
}

type DocumentHappening = { at: string; by: string | null; document: EventDocument }

/**
 * Uploads and removals, a batch of each by one person one event. A finished upload counts; one never finished
 * doesn't.
 */
function documentEvents(uploads: readonly DocumentUpload[], byName: Namer): ActivityEvent[] {
  const named = ({ id, title, version }: DocumentUpload): EventDocument => ({ id, title, version })
  const added = uploads
    .filter((upload) => upload.status !== "uploading")
    .map((upload): DocumentHappening => ({ at: upload.uploadedAt, by: upload.uploadedBy, document: named(upload) }))
  // Removing a document removes every version of it at once: one removal, named by its latest version.
  const removals = uploads.flatMap((upload) => (upload.removedAt === null ? [] : [{ at: upload.removedAt, upload }]))
  const removed = [...Map.groupBy(removals, ({ upload }) => upload.lineageId).values()]
    .map((versions) => versions.reduce((latest, item) => (item.upload.version > latest.upload.version ? item : latest)))
    .map(({ at, upload }): DocumentHappening => ({ at, by: upload.removedBy, document: named(upload) }))
  const events = (type: "documents-added" | "documents-removed", happened: readonly DocumentHappening[]) =>
    [...Map.groupBy(happened, ({ by }) => by).values()].flatMap((theirs) =>
      batches(theirs).map(({ at, items }): ActivityEvent => ({
        id: `${type}:${items[0].document.id}`,
        at,
        by: byName(items[0].by),
        type,
        documents: items.map((item) => item.document)
      }))
    )
  return [...events("documents-added", added), ...events("documents-removed", removed)]
}

/** Runs of things that happened, each a batch window or less after the one before it; a run is dated by its last. */
function batches<T extends { at: string }>(items: readonly T[]): { at: string; items: [T, ...T[]] }[] {
  const runs: { at: string; items: [T, ...T[]] }[] = []
  for (const item of items.toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const run = runs.at(-1)
    if (run && Date.parse(item.at) - Date.parse(run.at) <= batchWindow) {
      run.items.push(item)
      run.at = item.at
    } else {
      runs.push({ at: item.at, items: [item] })
    }
  }
  return runs
}
