// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  createApplication,
  createApplicationFile,
  deleteApplication,
  deleteApplicationFile,
  getApplication,
  listApplicationFiles,
  listApplications,
  listExpiredApplications,
  listReviewSummaries,
  saveReviewSummary,
  transitionApplication,
  updateApplication
} from "./applicationRepository"
import { listSections, saveSections } from "./documentRepository"
import { failRulebook, getRulebook, getRulebookByStatus, insertRulebook, publishRulebook } from "./rulebookRepository"

// The rules the database itself enforces: unique indexes, guarded updates, cascades and D1's statement limits.

const hoaId = "demo-hoa"
const now = "2026-10-08T00:00:00.000Z"

describe("repositories", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("saves more sections than fit in one statement's bound parameters", async () => {
    const { db } = database
    const many = Array.from({ length: 30 }, (_, ordinal) => ({
      id: `long:${ordinal}`,
      documentId: "long",
      ordinal,
      number: "5.4.2",
      heading: "5.4.2 Composite Fence Colors",
      kind: "body" as const,
      parentId: null,
      pageStart: 17,
      pageEnd: 17,
      startOffset: 0,
      endOffset: 100,
      references: ["long:1"]
    }))
    await saveSections(db, hoaId, many)
    await saveSections(db, hoaId, [])
    expect(await listSections(db, hoaId, "long")).toHaveLength(30)
  })

  it("publishes a draft as the next version, superseding the last, and allows one draft at a time", async () => {
    const { db } = database
    const rulebook = (id: string, status: "building" | "draft") => ({
      id,
      hoaId,
      version: null,
      status,
      error: null,
      catalogVersion: 0,
      sourceDocumentIds: ["guidelines"],
      jobId: `job-${id}`,
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    })

    await insertRulebook(db, rulebook("first", "draft"))
    expect((await getRulebookByStatus(db, hoaId, "draft"))?.id).toBe("first")
    await expect(insertRulebook(db, rulebook("second-draft", "draft"))).rejects.toThrow("Failed query")
    expect(await publishRulebook(db, hoaId, { rulebookId: "first", userId: "admin", now })).toBe(1)
    expect(await getRulebookByStatus(db, hoaId, "published")).toMatchObject({
      id: "first",
      version: 1,
      publishedBy: "admin"
    })

    await insertRulebook(db, rulebook("second", "draft"))
    expect(await publishRulebook(db, hoaId, { rulebookId: "second", userId: "admin", now })).toBe(2)
    expect((await getRulebook(db, hoaId, "first"))?.status).toBe("superseded")

    await insertRulebook(db, rulebook("broken", "building"))
    await failRulebook(db, hoaId, "broken", { stage: "extract", message: "x", isRetryable: true })
    expect((await getRulebook(db, hoaId, "broken"))?.status).toBe("failed")
  })

  it("moves an application only from the expected statuses", async () => {
    const { db } = database
    const application = await createApplication(db, {
      hoaId,
      projectTypeId: null,
      answers: null,
      description: "New fence",
      createdBy: "demo-homeowner",
      now,
      deleteAfter: "2026-11-07T00:00:00.000Z"
    })
    const start = () =>
      transitionApplication(db, hoaId, application.id, ["draft", "reviewed"], { status: "reviewing", updatedAt: now })
    expect(await start()).toHaveLength(1)
    expect(await start()).toHaveLength(0)
    expect((await getApplication(db, hoaId, application.id))?.status).toBe("reviewing")
    expect(await listApplications(db, hoaId, { createdBy: "demo-homeowner", statuses: ["reviewing"] })).toHaveLength(1)
    expect(await listApplications(db, hoaId, { createdBy: "someone-else" })).toHaveLength(0)
    expect(await listExpiredApplications(db, "2026-12-01T00:00:00.000Z")).toHaveLength(1)
    expect(await listExpiredApplications(db, now)).toHaveLength(0)
    await updateApplication(db, hoaId, application.id, { deleteAfter: null })
    expect(await listExpiredApplications(db, "2026-12-01T00:00:00.000Z")).toHaveLength(0)
  })

  it("deletes a file with the files taken from it, and an application with everything in it", async () => {
    const { db } = database
    const application = await createApplication(db, {
      hoaId,
      projectTypeId: null,
      answers: null,
      description: null,
      createdBy: "h",
      now,
      deleteAfter: now
    })
    const word = await createApplicationFile(db, {
      hoaId,
      applicationId: application.id,
      fileName: "appendix.docx",
      mediaType: "x",
      sizeBytes: 1,
      now
    })
    const picture = await createApplicationFile(db, {
      hoaId,
      applicationId: application.id,
      parentFileId: word.id,
      ordinal: 2,
      contextText: "Here's a photo of the gate",
      fileName: "image2.png",
      mediaType: "image/png",
      sizeBytes: 1,
      status: "ready",
      now
    })
    await saveReviewSummary(db, {
      id: "review-1",
      hoaId,
      applicationId: application.id,
      jobId: "job",
      rulebookId: "rb",
      rulesFileSha256: "a".repeat(64),
      recommendation: "request-information",
      costUsd: 0.01,
      sessionId: "job",
      createdAt: now
    })

    expect(await deleteApplicationFile(db, hoaId, word.id)).toEqual([word.id, picture.id])
    expect(await listApplicationFiles(db, hoaId, application.id)).toEqual([])

    await deleteApplication(db, hoaId, application.id)
    expect(await getApplication(db, hoaId, application.id)).toBeNull()
    expect(await listReviewSummaries(db, hoaId, application.id)).toEqual([])
  })
})
