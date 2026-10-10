// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { insertJob, newJob } from "@/db/jobRepository"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import type { ResultsBucket } from "./buildResults"
import { loadBuildResults } from "./buildResults.server"

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
    await insertJob(db, newJob({ id: "build-1", hoaId: "hoa-a", kind: "rulebook-build", subjectId: "rb-1", now }))
    await insertJob(db, newJob({ id: "ingest-1", hoaId: "hoa-a", kind: "document-ingest", subjectId: "doc-1", now }))

    expect(await loadBuildResults(db, emptyBucket, "hoa-a", { jobId: "build-1", since: null })).toEqual({
      results: [],
      cursor: null,
      documents: []
    })
    await expect(loadBuildResults(db, emptyBucket, "hoa-b", { jobId: "build-1", since: null })).rejects.toThrow(
      "isn't one of this organization's"
    )
    await expect(loadBuildResults(db, emptyBucket, "hoa-a", { jobId: "ingest-1", since: null })).rejects.toThrow(
      "isn't one of this organization's"
    )
  })
})
