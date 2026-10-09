// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { GoverningDocument, Provision } from "@/schema/types"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  createGoverningDocument,
  getGoverningDocument,
  getProvision,
  listDocumentRecords,
  listGoverningDocuments,
  listProvisions,
  saveProvisions,
  saveReferencedDocuments
} from "./documentRepository"
import { provisions } from "./schema"

// The rules schema's documents and provisions, beside the first build's uploads.

const hoaId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"

const bylaws: GoverningDocument = {
  key: "by-laws",
  kind: "bylaws",
  title: "By-Laws",
  issuedBy: null,
  governs: null,
  edition: null
}

function provision(label: string, parentLabel: string | null): Provision {
  return {
    key: `by-laws:${label}`,
    kind: parentLabel ? "section" : "article",
    num: null,
    label,
    heading: `Heading ${label}`,
    parentLabel,
    intro: null,
    text: `Text of ${label}`,
    wrapUp: null,
    anchors: [],
    noRule: null
  }
}

describe("document records and provisions", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("records referenced documents without a file, apart from the uploads", async () => {
    const { db } = database
    const upload = await createGoverningDocument(db, {
      hoaId,
      kind: "declaration",
      title: "Declaration",
      effectiveDate: null,
      fileName: "declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await saveReferencedDocuments(db, hoaId, [{ id: "bylaws", document: bylaws }], "system", now)
    await saveReferencedDocuments(
      db,
      hoaId,
      [{ id: "bylaws", document: { ...bylaws, title: "By-Laws, restated" } }],
      "system",
      now
    )

    expect(await listDocumentRecords(db, hoaId)).toEqual([
      { id: "bylaws", document: { ...bylaws, title: "By-Laws, restated" } }
    ])
    expect((await listGoverningDocuments(db, hoaId)).map((document) => document.id)).toEqual([upload.id])
    expect(await getGoverningDocument(db, hoaId, "bylaws")).toBeNull()
    // A key belongs to one document in an organization.
    await expect(
      saveReferencedDocuments(db, hoaId, [{ id: "other", document: bylaws }], "system", now)
    ).rejects.toThrow("UNIQUE constraint failed")
  })

  it("replaces a document's provisions and reads them in order", async () => {
    const { db } = database
    const items = [provision("article-1", null), provision("1.1", "article-1"), provision("1.2", "article-1")]
    await saveProvisions(db, hoaId, "bylaws", [provision("old", null)])
    await saveProvisions(db, hoaId, "bylaws", items)

    expect(await listProvisions(db, hoaId, ["bylaws"])).toEqual(items)
    expect(await listProvisions(db, hoaId, [])).toEqual([])
    expect(await getProvision(db, hoaId, "by-laws:1.2")).toEqual(items[2])
    expect(await getProvision(db, hoaId, "by-laws:old")).toBeNull()
    expect((await db.select().from(provisions)).map((row) => [row.key, row.parentKey, row.ordinal])).toEqual([
      ["by-laws:article-1", null, 0],
      ["by-laws:1.1", "by-laws:article-1", 1],
      ["by-laws:1.2", "by-laws:article-1", 2]
    ])
  })
})
