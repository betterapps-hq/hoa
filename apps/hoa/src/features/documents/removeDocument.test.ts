// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createGoverningDocument,
  findDocumentByHash,
  getGoverningDocument,
  listGoverningDocuments,
  updateGoverningDocument
} from "@/db/documentRepository"
import { insertRulebook } from "@/db/rulebookRepository"
import { checkCurrentSources, isRefusedBuild, refusedDocuments } from "@/rulebook/buildSources"
import { currentDocumentIds } from "@/rulebook/currentDocuments"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
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

  it("is for administrators only", async () => {
    const document = await upload("Declaration", "a".repeat(64))
    await expect(
      removeDocument(database.db, { hoa: { id: hoaId }, role: "homeowner" }, document.id, now)
    ).rejects.toThrow("Only an administrator can do this.")
    expect(await listGoverningDocuments(database.db, hoaId)).toHaveLength(1)
  })

  it("takes every version out of the documents builds read, and clears a refusal it caused", async () => {
    const { db } = database
    const bad = await upload("Declaration (sample pages)", "sample-declaration-pages")
    const newer = await upload("Declaration (sample pages)", "b".repeat(64), bad.lineageId)
    const good = await upload("Declaration, restated", "c".repeat(64))

    const current = currentDocumentIds(await listGoverningDocuments(db, hoaId))
    expect(current).toContain(newer.id)

    await removeDocument(db, administrator, newer.id, now)
    const remaining = await listGoverningDocuments(db, hoaId)
    expect(remaining.map((document) => document.id)).toEqual([good.id])
    // What cites its pages still opens them, and the same file can be uploaded again.
    expect(await getGoverningDocument(db, hoaId, bad.id)).not.toBeNull()
    expect(await findDocumentByHash(db, hoaId, "sample-declaration-pages", "new-upload")).toBeNull()
    expect(await checkCurrentSources(db, hoaId, currentDocumentIds(remaining))).toEqual([])

    await expect(removeDocument(db, administrator, newer.id, now)).rejects.toThrow("already removed")
  })

  it("is refused while a build reads the documents", async () => {
    const document = await upload("Declaration", "a".repeat(64))
    await insertRulebook(database.db, {
      id: "building",
      hoaId,
      version: null,
      status: "building",
      error: null,
      catalogVersion: 0,
      sourceDocumentIds: [document.id],
      jobId: "job",
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    })
    await expect(removeDocument(database.db, administrator, document.id, now)).rejects.toThrow("being built")
  })
})

describe("checkCurrentSources", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("finds what a build would refuse in the documents as they are", async () => {
    const { db } = database
    const document = await createGoverningDocument(db, {
      hoaId,
      kind: "declaration",
      title: "Declaration (sample pages)",
      effectiveDate: null,
      fileName: "declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await updateGoverningDocument(db, hoaId, document.id, {
      status: "ready",
      sha256: "sample-declaration-pages",
      pageCount: 3
    })
    expect(await checkCurrentSources(db, hoaId, [document.id])).toEqual([
      { documentId: document.id, title: "Declaration (sample pages)", kind: "file-invalid" }
    ])
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
