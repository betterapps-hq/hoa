// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { GoverningDocument } from "@/schema/types"
import { builtDocuments, hoaId, now, seedUpload } from "@/tests/builtDraft"
import { provision } from "@/tests/encodingDrafts"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  builtDocumentRecords,
  listDocumentRecords,
  listProvisions,
  saveBuiltDocuments,
  saveProvisions,
  saveReferencedDocuments
} from "./documentRepository"

const bylaws: GoverningDocument = {
  key: "by-laws",
  kind: "bylaws",
  title: "By-Laws",
  issuedBy: null,
  governs: null,
  edition: null
}

describe("builtDocumentRecords", () => {
  it("keeps the upload's id for its own document and keys the rest, so every build writes the same records", () => {
    const records = builtDocumentRecords(hoaId, builtDocuments("upload-1"))
    expect(records.map((record) => [record.id, record.document.key, record.isUpload])).toEqual([
      ["upload-1", "declaration", true],
      [`${hoaId}:rules`, "rules", false],
      [`${hoaId}:by-laws`, "by-laws", false]
    ])
  })
})

describe("document records", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("gives a document key to one document in an organization", async () => {
    const { db } = database
    await saveReferencedDocuments(db, hoaId, [{ id: "bylaws", document: bylaws }], "system", now)
    await expect(
      saveReferencedDocuments(db, hoaId, [{ id: "other", document: bylaws }], "system", now)
    ).rejects.toThrow("UNIQUE constraint failed")
  })

  it("takes a key from the document that held it before, with its provisions", async () => {
    const { db } = database
    const documents = await seedUpload(db)
    const rules = {
      key: "rules",
      kind: "rules" as const,
      title: "Old rules",
      issuedBy: null,
      governs: null,
      edition: null
    }
    await saveReferencedDocuments(db, hoaId, [{ id: "old-rules", document: rules }], "admin", now)
    await saveProvisions(db, hoaId, "old-rules", [provision("rules:9", null, "Gone.")])

    await saveBuiltDocuments(db, hoaId, documents, "admin", now)
    await saveBuiltDocuments(db, hoaId, documents, "admin", now)

    const records = await listDocumentRecords(db, hoaId)
    expect(records.map((record) => [record.document.key, record.id])).toEqual([
      ["by-laws", `${hoaId}:by-laws`],
      ["declaration", documents.uploads[0]?.documentId],
      ["rules", `${hoaId}:rules`]
    ])
    const keys = (await listProvisions(db, hoaId, ["old-rules", `${hoaId}:rules`])).map((item) => item.key)
    expect(keys).not.toContain("rules:9")
    expect(keys).toContain("rules:1")
  })
})
