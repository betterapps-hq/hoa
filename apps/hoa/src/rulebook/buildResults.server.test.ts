// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createGoverningDocument } from "@/db/documentRepository"
import { insertJob, newJob } from "@/db/jobRepository"
import { insertRulebook } from "@/db/rulebookRepository"
import { jobOutputKey } from "@/storage/keys"
import { simulatedBuildSeconds } from "@/tests/simulatedBuild"
import { readingDocuments } from "@/tests/simulatedReading"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import type { ResultsBucket } from "./buildResults"
import { loadBuildDocuments, loadBuildResults } from "./buildResults.server"

const now = "2026-10-09T00:00:00.000Z"
const emptyBucket: ResultsBucket = {
  list: async () => ({ objects: [], truncated: false }),
  get: async () => null
}

describe("loadBuildResults", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("reads only a rulebook build of the asking organization", async () => {
    const { db } = database
    await insertJob(
      db,
      newJob({ id: "build-1", organizationId: "hoa-a", kind: "rulebook-build", subjectId: "rb-1", now })
    )
    await insertJob(
      db,
      newJob({ id: "ingest-1", organizationId: "hoa-a", kind: "document-ingest", subjectId: "doc-1", now })
    )

    expect(await loadBuildResults(db, emptyBucket, "hoa-a", { jobId: "build-1", since: null })).toEqual({
      results: [],
      cursor: null
    })
    await expect(loadBuildResults(db, emptyBucket, "hoa-b", { jobId: "build-1", since: null })).rejects.toThrow(
      "isn't one of this organization's"
    )
    await expect(loadBuildResults(db, emptyBucket, "hoa-a", { jobId: "ingest-1", since: null })).rejects.toThrow(
      "isn't one of this organization's"
    )
  })
})

describe("loadBuildDocuments", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("gives the documents once the build has structured them, with their titles and provisions", async () => {
    const { db } = database
    const upload = await createGoverningDocument(db, {
      organizationId: "hoa-a",
      kind: "declaration",
      title: "Declaration of Covenants for Maple Hollow",
      effectiveDate: null,
      fileName: "declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await insertRulebook(db, {
      id: "rb-1",
      organizationId: "hoa-a",
      version: null,
      status: "building",
      error: null,
      catalogVersion: 0,
      sourceDocumentIds: [upload.id],
      jobId: "build-1",
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    })
    await insertJob(
      db,
      newJob({ id: "build-1", organizationId: "hoa-a", kind: "rulebook-build", subjectId: "rb-1", now })
    )
    const [declaration] = readingDocuments(simulatedBuildSeconds)
    const structured: ResultsBucket = {
      ...emptyBucket,
      get: async (key) =>
        key === jobOutputKey("hoa-a", "build-1", "structure", upload.id)
          ? {
              text: async () =>
                JSON.stringify({ documents: [{ key: "declaration", provisions: declaration?.provisions }] })
            }
          : null
    }

    expect(await loadBuildDocuments(db, emptyBucket, "hoa-a", "build-1")).toEqual([])
    expect(await loadBuildDocuments(db, structured, "hoa-a", "build-1")).toEqual([
      { key: "declaration", title: "Declaration of Covenants for Maple Hollow", provisions: declaration?.provisions }
    ])
    await expect(loadBuildDocuments(db, structured, "hoa-b", "build-1")).rejects.toThrow(
      "isn't one of this organization's"
    )
  })
})
