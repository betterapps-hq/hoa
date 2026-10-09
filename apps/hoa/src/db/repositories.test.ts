// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  createApplication,
  createApplicationFile,
  deleteApplication,
  deleteApplicationFile,
  getApplication,
  getApplicationFile,
  listApplicationFiles,
  listApplications,
  listExpiredApplications,
  listPageKinds,
  listReviewSummaries,
  saveReviewSummary,
  setPageKinds,
  transitionApplication,
  updateApplication,
  updateApplicationFile
} from "./applicationRepository"
import {
  createGoverningDocument,
  findDocumentByHash,
  getGoverningDocument,
  listGoverningDocuments,
  listSections,
  saveSections,
  setSectionRouting,
  updateGoverningDocument
} from "./documentRepository"
import { getJob, getLatestJob, getLatestJobOfKind, insertJob, listJobs, newJob, updateJob } from "./jobRepository"
import { failRulebook, getRulebook, getRulebookByStatus, insertRulebook, publishRulebook } from "./rulebookRepository"

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

  it("versions governing documents within a lineage and finds duplicates by hash", async () => {
    const { db } = database
    const input = {
      hoaId,
      kind: "design-guidelines" as const,
      title: "Design guidelines",
      effectiveDate: null,
      fileName: "guidelines.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now
    }
    const first = await createGoverningDocument(db, input)
    const second = await createGoverningDocument(db, { ...input, lineageId: first.lineageId })
    expect([first.version, second.version]).toEqual([1, 2])
    expect(second.lineageId).toBe(first.id)

    await updateGoverningDocument(db, hoaId, first.id, { status: "ready", sha256: "abc", pageCount: 3 })
    expect(await getGoverningDocument(db, hoaId, first.id)).toMatchObject({ status: "ready", pageCount: 3 })
    expect((await findDocumentByHash(db, hoaId, "abc", second.id))?.id).toBe(first.id)
    expect(await findDocumentByHash(db, hoaId, "abc", first.id)).toBeNull()
    expect(await getGoverningDocument(db, "other-hoa", first.id)).toBeNull()
    expect(await listGoverningDocuments(db, hoaId)).toHaveLength(2)
  })

  const section = {
    id: "doc:0",
    documentId: "doc",
    ordinal: 0,
    number: "5.4.2",
    heading: "5.4.2 Composite Fence Colors",
    kind: "body" as const,
    parentId: null,
    pageStart: 17,
    pageEnd: 17,
    startOffset: 0,
    endOffset: 100,
    references: ["doc:1"]
  }
  it("writes sections once and keeps their latest routing", async () => {
    const { db } = database
    await saveSections(db, hoaId, [section])
    await saveSections(db, hoaId, [{ ...section, heading: "Changed" }])
    await setSectionRouting(db, hoaId, "doc:0", { projectTypes: ["project"], topics: ["topic"], isRelevant: true })
    expect(await listSections(db, hoaId, "doc")).toEqual([
      { ...section, routing: { projectTypes: ["project"], topics: ["topic"], isRelevant: true } }
    ])
  })

  it("saves more sections than fit in one statement's bound parameters", async () => {
    const { db } = database
    const many = Array.from({ length: 30 }, (_, ordinal) => ({
      ...section,
      id: `long:${ordinal}`,
      documentId: "long",
      ordinal
    }))
    await saveSections(db, hoaId, many)
    await saveSections(db, hoaId, [])
    expect(await listSections(db, hoaId, "long")).toHaveLength(30)
  })

  it("records jobs and finds the latest one for a subject", async () => {
    const { db } = database
    const older = newJob({ hoaId, kind: "document-ingest", subjectId: "doc", now })
    const newer = newJob({ hoaId, kind: "document-ingest", subjectId: "doc", now: "2026-10-09T00:00:00.000Z" })
    await insertJob(db, older)
    await insertJob(db, newer)
    await updateJob(db, hoaId, older.id, {
      status: "failed",
      error: { stage: "ocr", message: "x", isRetryable: true },
      now
    })
    expect((await getJob(db, hoaId, older.id))?.status).toBe("failed")
    expect((await getLatestJob(db, hoaId, "doc"))?.id).toBe(newer.id)
    expect(await listJobs(db, hoaId, "doc")).toHaveLength(2)
    expect(await getLatestJob(db, hoaId, "nothing")).toBeNull()
    expect((await getLatestJobOfKind(db, hoaId, "document-ingest"))?.id).toBe(newer.id)
    expect(await getLatestJobOfKind(db, hoaId, "application-review")).toBeNull()
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

  it("stores files, page kinds and reviews, and deletes an application with everything in it", async () => {
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
    await updateApplicationFile(db, hoaId, word.id, { status: "ready", kind: "letter", pageCount: 1 })
    expect(await getApplicationFile(db, hoaId, word.id)).toMatchObject({ kind: "letter", pageCount: 1 })
    await setPageKinds(db, hoaId, word.id, ["letter"])
    await setPageKinds(db, hoaId, picture.id, ["photo"])
    expect(await listPageKinds(db, hoaId, [word.id, picture.id])).toHaveLength(2)
    expect(await listPageKinds(db, hoaId, [])).toEqual([])
    expect((await listApplicationFiles(db, hoaId, application.id)).map((file) => file.fileName)).toEqual([
      "appendix.docx",
      "image2.png"
    ])

    const summary = {
      id: "review-1",
      hoaId,
      applicationId: application.id,
      jobId: "job",
      rulebookId: "rb",
      rulesFileSha256: "a".repeat(64),
      recommendation: "request-information" as const,
      costUsd: 0.01,
      sessionId: "job",
      createdAt: now
    }
    await saveReviewSummary(db, summary)
    await saveReviewSummary(db, summary)
    expect(await listReviewSummaries(db, hoaId, application.id)).toEqual([summary])

    expect(await deleteApplicationFile(db, hoaId, word.id)).toEqual([word.id, picture.id])
    expect(await listApplicationFiles(db, hoaId, application.id)).toEqual([])

    await deleteApplication(db, hoaId, application.id)
    expect(await getApplication(db, hoaId, application.id)).toBeNull()
    expect(await listReviewSummaries(db, hoaId, application.id)).toEqual([])
  })
})
