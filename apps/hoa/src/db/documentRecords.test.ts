// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { GoverningDocument } from "@/schema/types"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { saveReferencedDocuments } from "./documentRepository"

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
})
