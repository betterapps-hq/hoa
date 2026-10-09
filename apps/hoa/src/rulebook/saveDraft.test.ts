// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getDocumentStructures,
  listDocumentRecords,
  listProvisions,
  saveProvisions,
  saveReferencedDocuments,
  setDocumentStructure
} from "@/db/documentRepository"
import { getRulebookContent, saveRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebook, getRulebookByStatus } from "@/db/rulebookRepository"
import { defaultDocumentStructure } from "@/documents/documentStructure"
import { builtContent, hoaId, insertBuildingRulebook, now, seedUpload } from "@/tests/builtDraft"
import { provision } from "@/tests/encodingDrafts"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { saveBuiltDraft } from "./saveDraft"

describe("saveBuiltDraft", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("keys the upload, saves its documents, provisions and records, and replaces the old draft", async () => {
    const { db } = database
    const documents = await seedUpload(db)
    // An earlier build's "rules" document gives up its key and provisions to the new one.
    await saveReferencedDocuments(
      db,
      hoaId,
      [
        {
          id: "old-rules",
          document: { key: "rules", kind: "rules", title: "Old rules", issuedBy: null, governs: null, edition: null }
        }
      ],
      "admin",
      now
    )
    await saveProvisions(db, hoaId, "old-rules", [provision("rules:9", null, "Gone.")])
    await insertBuildingRulebook(db, "old-draft", "draft")
    await saveRulebookContent(db, hoaId, "old-draft", builtContent)
    await insertBuildingRulebook(db, "built")

    const draft = { rulebookId: "built", documents, content: builtContent, recordedBy: "admin", now }
    await saveBuiltDraft(db, hoaId, draft)
    await saveBuiltDraft(db, hoaId, draft)

    const records = await listDocumentRecords(db, hoaId)
    expect(records.map((record) => [record.document.key, record.id])).toEqual([
      ["by-laws", `${hoaId}:by-laws`],
      ["declaration", documents.uploads[0]?.documentId],
      ["rules", `${hoaId}:rules`]
    ])
    const provisions = await listProvisions(
      db,
      hoaId,
      records.map((record) => record.id)
    )
    expect(provisions.map((item) => item.key).toSorted()).toEqual([
      "declaration:4.1",
      "rules:1",
      "rules:2",
      "rules:2(a)",
      "rules:3"
    ])
    expect((await getRulebook(db, hoaId, "built"))?.status).toBe("draft")
    expect(await getRulebook(db, hoaId, "old-draft")).toBeNull()
    expect(await getRulebookContent(db, hoaId, "old-draft")).toBeNull()
    expect((await getRulebookContent(db, hoaId, "built"))?.rules).toEqual(builtContent.rules)
    expect((await getRulebookByStatus(db, hoaId, "draft"))?.id).toBe("built")
  })

  it("stores how builds structure an upload", async () => {
    const { db } = database
    const documents = await seedUpload(db)
    const id = documents.uploads[0]?.documentId ?? ""
    expect(await getDocumentStructures(db, hoaId, [id])).toEqual(new Map())
    expect(await getDocumentStructures(db, hoaId, [])).toEqual(new Map())
    const structure = defaultDocumentStructure("declaration")
    await setDocumentStructure(db, hoaId, id, structure)
    expect(await getDocumentStructures(db, hoaId, [id])).toEqual(new Map([[id, structure]]))
  })
})
