import { describe, expect, it } from "vitest"
import { areaOf, recentActivity, type ActivitySources } from "./activity"

const people: Record<string, string> = { sam: "Sam Rivera", jordan: "Jordan Avery", alex: "Alex Kim" }

const none: ActivitySources = {
  applications: [],
  projectTypes: [],
  rulebooks: [],
  documents: [],
  nameOf: (userId) => people[userId] ?? userId
}

type Upload = ActivitySources["documents"][number]

/** A governing document Sam uploaded Oct 1, in use, with whatever the test overrides. */
const upload = (overrides: Partial<Upload> = {}): Upload => ({
  id: "declaration",
  lineageId: "declaration",
  version: 1,
  title: "Declaration",
  status: "ready",
  uploadedBy: "sam",
  uploadedAt: "2026-10-01T10:00:00.000Z",
  removedBy: null,
  removedAt: null,
  ...overrides
})

type Submitted = ActivitySources["applications"][number]

const fence: Submitted = {
  id: "fence",
  projectTypeLabel: "Fence",
  description: "A rear fence.",
  createdBy: "jordan",
  submittedAt: "2026-10-03T10:00:00.000Z",
  decision: { outcome: "approved", note: null, decidedBy: "sam", decidedAt: "2026-10-05T10:00:00.000Z" }
}

describe("recentActivity", () => {
  it("reads each area's events from its records, newest first, up to the limit, naming who did each", () => {
    const sources: ActivitySources = {
      ...none,
      applications: [fence],
      projectTypes: [{ id: "fence-type", label: "Fence", createdBy: "alex", createdAt: "2026-09-30T10:00:00.000Z" }],
      rulebooks: [{ id: "second", version: 2, publishedBy: "sam", publishedAt: "2026-10-04T10:00:00.000Z" }],
      documents: [upload()]
    }
    const events = recentActivity(sources)

    expect(events.map((event) => [event.type, areaOf(event), event.by])).toEqual([
      ["application-decided", "architectural-review", "Sam Rivera"],
      ["rulebook-published", "rulebook", "Sam Rivera"],
      ["application-submitted", "architectural-review", "Jordan Avery"],
      ["documents-added", "rulebook", "Sam Rivera"],
      ["project-type-added", "architectural-review", "Alex Kim"]
    ])
    expect(events[0]).toMatchObject({
      application: { id: "fence", projectTypeLabel: "Fence", description: "A rear fence." },
      outcome: "approved"
    })
    expect(events[1]).toMatchObject({ version: 2, at: "2026-10-04T10:00:00.000Z" })
    expect(recentActivity(sources, 2)).toHaveLength(2)
    expect(recentActivity(none)).toEqual([])
  })

  it("leaves who did it out when the record doesn't say", () => {
    const events = recentActivity({
      ...none,
      projectTypes: [{ id: "deck", label: "Deck", createdBy: null, createdAt: "2026-09-30T10:00:00.000Z" }],
      rulebooks: [{ id: "first", version: 1, publishedBy: null, publishedAt: "2026-10-01T10:00:00.000Z" }]
    })
    expect(events.map((event) => event.by)).toEqual([null, null])
  })

  it("says when the homeowner submitted again after the committee asked for more", () => {
    const answered: Submitted = {
      id: "paint",
      projectTypeLabel: null,
      description: null,
      createdBy: "jordan",
      submittedAt: "2026-10-06T10:00:00.000Z",
      decision: {
        outcome: "information-requested",
        note: null,
        decidedBy: "sam",
        decidedAt: "2026-10-04T10:00:00.000Z"
      }
    }
    const [submitted, asked] = recentActivity({ ...none, applications: [answered, { ...fence, decision: null }] })

    expect(submitted).toMatchObject({
      type: "application-submitted",
      by: "Jordan Avery",
      again: true,
      application: { projectTypeLabel: null }
    })
    expect(asked).toMatchObject({ type: "application-decided", by: "Sam Rivera", outcome: "information-requested" })
    expect(recentActivity({ ...none, applications: [fence] }).at(-1)).toMatchObject({ again: false })
  })

  it("leaves out rulebooks that were never published", () => {
    const rulebooks = [
      { id: "draft", version: null, publishedBy: null, publishedAt: null },
      { id: "first", version: 1, publishedBy: "sam", publishedAt: "2026-10-01T10:00:00.000Z" }
    ]
    expect(recentActivity({ ...none, rulebooks }).map((event) => event.id)).toEqual(["rulebook-published:first"])
  })

  it("makes one event of the documents one person added together, and leaves out an upload never finished", () => {
    const documents = [
      upload(),
      upload({ id: "bylaws", lineageId: "bylaws", title: "Bylaws", uploadedAt: "2026-10-01T10:05:00.000Z" }),
      upload({
        id: "rules",
        lineageId: "rules",
        title: "Rules",
        uploadedBy: "alex",
        uploadedAt: "2026-10-01T10:06:00.000Z"
      }),
      upload({
        id: "guidelines",
        lineageId: "guidelines",
        title: "Guidelines",
        uploadedAt: "2026-10-03T09:00:00.000Z"
      }),
      upload({ id: "left", lineageId: "left", status: "uploading", uploadedAt: "2026-10-03T09:01:00.000Z" })
    ]
    const events = recentActivity({ ...none, documents })

    expect(events).toEqual([
      {
        id: "documents-added:guidelines",
        at: "2026-10-03T09:00:00.000Z",
        by: "Sam Rivera",
        type: "documents-added",
        documents: [{ id: "guidelines", title: "Guidelines", version: 1 }]
      },
      {
        id: "documents-added:rules",
        at: "2026-10-01T10:06:00.000Z",
        by: "Alex Kim",
        type: "documents-added",
        documents: [{ id: "rules", title: "Rules", version: 1 }]
      },
      {
        id: "documents-added:declaration",
        at: "2026-10-01T10:05:00.000Z",
        by: "Sam Rivera",
        type: "documents-added",
        documents: [
          { id: "declaration", title: "Declaration", version: 1 },
          { id: "bylaws", title: "Bylaws", version: 1 }
        ]
      }
    ])
  })

  it("makes one removal of a document's versions, named by the latest", () => {
    const removed = { removedBy: "alex", removedAt: "2026-10-05T10:00:00.000Z" }
    const documents = [
      upload(removed),
      upload({
        id: "amended",
        version: 2,
        title: "Amended declaration",
        uploadedAt: "2026-10-02T10:00:00.000Z",
        ...removed
      })
    ]
    const [removal] = recentActivity({ ...none, documents })

    expect(removal).toEqual({
      id: "documents-removed:amended",
      at: removed.removedAt,
      by: "Alex Kim",
      type: "documents-removed",
      documents: [{ id: "amended", title: "Amended declaration", version: 2 }]
    })
  })
})
