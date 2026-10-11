// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { saveBuiltDraft } from "@/rulebook/saveDraft"
import { builtContent as content, hoaId, now } from "@/tests/builtDraft"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  discardDraftRulebook,
  getRulebookContent,
  promoteToDraft,
  saveRulebookContent
} from "./rulebookContentRepository"
import { cancelRulebook, getRulebook, insertRulebook, publishRulebook } from "./rulebookRepository"
import { rulebookQuestions, rulebookRules, rulebookTerms } from "./schema"

// The rules the database enforces on rulebooks: one building and one draft at a time, a build that was stopped never
// replaces the draft, and discarding removes only a draft.

function rulebook(id: string, status: "building" | "draft") {
  return {
    id,
    hoaId,
    version: null,
    status,
    error: null,
    catalogVersion: 0,
    sourceDocumentIds: [],
    jobId: `job-${id}`,
    createdAt: now,
    publishedBy: null,
    publishedAt: null
  }
}

describe("rulebookContentRepository", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("allows one building and one draft rulebook per organization, with no records until saved", async () => {
    const { db } = database
    await insertRulebook(db, rulebook("building", "building"))
    await insertRulebook(db, rulebook("draft", "draft"))
    await expect(insertRulebook(db, rulebook("second-building", "building"))).rejects.toThrow("Failed query")
    await expect(insertRulebook(db, rulebook("second-draft", "draft"))).rejects.toThrow("Failed query")
    expect(await getRulebookContent(db, hoaId, "building")).toBeNull()
    expect(await getRulebookContent(db, hoaId, "missing")).toBeNull()
  })

  it("replaces the draft with a built rulebook, and discards only a draft", async () => {
    const { db } = database
    const rowsOf = async (rulebookId: string) =>
      [
        ...(await db.select().from(rulebookRules)),
        ...(await db.select().from(rulebookTerms)),
        ...(await db.select().from(rulebookQuestions))
      ].filter((row) => row.rulebookId === rulebookId).length
    await insertRulebook(db, rulebook("old", "draft"))
    await saveRulebookContent(db, hoaId, "old", content)
    await insertRulebook(db, rulebook("new", "building"))
    await saveRulebookContent(db, hoaId, "new", content)

    await promoteToDraft(db, hoaId, "new")
    expect(await getRulebook(db, hoaId, "old")).toBeNull()
    expect(await rowsOf("old")).toBe(0)
    expect((await getRulebook(db, hoaId, "new"))?.status).toBe("draft")

    await publishRulebook(db, hoaId, { rulebookId: "new", userId: "admin", now })
    await discardDraftRulebook(db, hoaId, "new")
    expect((await getRulebook(db, hoaId, "new"))?.status).toBe("published")
    expect(await rowsOf("new")).toBeGreaterThan(0)

    await insertRulebook(db, rulebook("next", "draft"))
    await saveRulebookContent(db, hoaId, "next", content)
    await discardDraftRulebook(db, hoaId, "next")
    expect(await getRulebook(db, hoaId, "next")).toBeNull()
    expect(await rowsOf("next")).toBe(0)
    expect(await rowsOf("new")).toBeGreaterThan(0)
  })

  it("never lets a stopped build replace the draft", async () => {
    const { db } = database
    await insertRulebook(db, rulebook("old", "draft"))
    await saveRulebookContent(db, hoaId, "old", content)
    await insertRulebook(db, rulebook("stopped", "building"))
    expect(await cancelRulebook(db, hoaId, "stopped")).toBe(true)
    expect(await cancelRulebook(db, hoaId, "stopped")).toBe(false)

    await promoteToDraft(db, hoaId, "stopped")
    expect((await getRulebook(db, hoaId, "old"))?.status).toBe("draft")
    expect((await getRulebookContent(db, hoaId, "old"))?.rules).toHaveLength(content.rules.length)
    expect((await getRulebook(db, hoaId, "stopped"))?.status).toBe("cancelled")
    await expect(
      saveBuiltDraft(db, hoaId, {
        rulebookId: "stopped",
        documents: { uploads: [], referenced: [] },
        content,
        recordedBy: "rulebook-build",
        now
      })
    ).rejects.toThrow("was stopped")
    expect(await getRulebookContent(db, hoaId, "stopped")).toBeNull()
  })
})
