// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createGoverningDocument,
  findDocumentByHash,
  getGoverningDocument,
  listGoverningDocuments,
  updateGoverningDocument
} from "@/db/documentRepository"
import { failRulebook, insertRulebook } from "@/db/rulebookRepository"
import { isRefusedBuild, refusedDocuments } from "@/rulebook/buildSources"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { untouchedDatabase } from "@/tests/untouchedDatabase"
import { removeDocument } from "./removeDocument"

const hoaId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"
const administrator = { hoa: { id: hoaId }, role: "administrator" as const }

describe("removeDocument", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  const upload = async (title: string, sha256: string, lineageId?: string) => {
    const document = await createGoverningDocument(database.db, {
      hoaId,
      kind: "declaration",
      title,
      effectiveDate: null,
      fileName: "declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now,
      ...(lineageId ? { lineageId } : {})
    })
    await updateGoverningDocument(database.db, hoaId, document.id, { status: "ready", sha256, pageCount: 3 })
    return document
  }

  it("is refused while a build reads the documents, and otherwise takes out every version of the document", async () => {
    const { db } = database
    const first = await upload("Declaration", "a".repeat(64))
    const newer = await upload("Declaration", "b".repeat(64), first.lineageId)
    const other = await upload("Declaration, restated", "c".repeat(64))
    await insertRulebook(db, {
      id: "building",
      hoaId,
      version: null,
      status: "building",
      error: null,
      catalogVersion: 0,
      sourceDocumentIds: [newer.id],
      jobId: "job",
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    })
    await expect(removeDocument(db, administrator, newer.id, now)).rejects.toThrow("being processed")
    await failRulebook(db, hoaId, "building", { stage: "check", message: "x", isRetryable: false })

    await removeDocument(db, administrator, newer.id, now)
    expect((await listGoverningDocuments(db, hoaId)).map((document) => document.id)).toEqual([other.id])
    // What cites its pages still opens them, and the same file can be uploaded again.
    expect(await getGoverningDocument(db, hoaId, first.id)).not.toBeNull()
    expect(await findDocumentByHash(db, hoaId, "a".repeat(64), "new-upload")).toBeNull()
    await expect(removeDocument(db, administrator, newer.id, now)).rejects.toThrow("already removed")
  })
})

describe("removing a document", () => {
  it("is for administrators only", async () => {
    await expect(
      removeDocument(untouchedDatabase(), { hoa: { id: hoaId }, role: "homeowner" }, "document", now)
    ).rejects.toThrow("Only an administrator can do this.")
  })
})

describe("refusedDocuments", () => {
  it("keeps one problem per document, the most pressing, without developer detail", () => {
    const problem = { documentId: "a", title: "A", detail: "x" }
    expect(
      refusedDocuments([
        { ...problem, kind: "duplicate-key", otherTitle: "B" },
        { ...problem, kind: "file-invalid" },
        { ...problem, documentId: "b", title: "B", kind: "structure-invalid" }
      ])
    ).toEqual([
      { documentId: "a", title: "A", kind: "file-invalid" },
      { documentId: "b", title: "B", kind: "structure-invalid" }
    ])
  })
})

describe("isRefusedBuild", () => {
  const job = {
    id: "job",
    hoaId,
    kind: "rulebook-build" as const,
    subjectId: "rulebook",
    status: "failed" as const,
    stage: "check",
    done: 0,
    total: 0,
    promptVersions: {},
    failures: [],
    error: { stage: "check", message: "x", isRetryable: false },
    progress: null,
    createdAt: now,
    updatedAt: now
  }

  it("is a failed check that retrying can't change", () => {
    expect(isRefusedBuild(job)).toBe(true)
    expect(isRefusedBuild({ ...job, error: { ...job.error, isRetryable: true } })).toBe(false)
    expect(isRefusedBuild({ ...job, error: { ...job.error, stage: "find-rules" } })).toBe(false)
    expect(isRefusedBuild(null)).toBe(false)
  })
})
