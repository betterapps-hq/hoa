// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Review } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  discardDraftRulebook,
  getPublishedRulesFile,
  getRulebookContent,
  getRulebookRule,
  promoteToDraft,
  recordRulebookFile,
  saveRulebookContent,
  saveRulebookChanges,
  type RulebookContent
} from "./rulebookContentRepository"
import { getRulebook, insertRulebook, publishRulebook } from "./rulebookRepository"
import { rulebookQuestions, rulebookRules, rulebookTerms } from "./schema"

const hoaId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"
const sample = sampleRulesFile()
const content: RulebookContent = {
  settings: sample.settings,
  coverage: { provisions: sample.provisions.length, uncovered: ["declaration:21.4"] },
  rules: sample.rules,
  terms: [...sample.terms, ...sample.proposedCore],
  questions: sample.questions
}
const approved: Review = { status: "approved", by: "admin", at: now, note: null }

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

  it("saves a whole rulebook in one batch, replacing what it had", async () => {
    const { db } = database
    await insertRulebook(db, rulebook("draft", "draft"))
    await saveRulebookContent(db, hoaId, "draft", { ...content, rules: content.rules.slice(0, 3) })
    await saveRulebookContent(db, hoaId, "draft", content)

    const saved = await getRulebookContent(db, hoaId, "draft")
    expect(saved?.settings).toEqual(content.settings)
    expect(saved?.coverage).toEqual(content.coverage)
    expect(saved?.rules).toHaveLength(content.rules.length)
    expect(saved?.terms).toHaveLength(content.terms.length)
    expect(saved?.questions).toEqual(expect.arrayContaining(content.questions))

    const [row] = await db.select().from(rulebookRules).limit(1)
    expect(row).toMatchObject({ hoaId, rulebookId: "draft", reviewStatus: "proposed" })
    expect(row?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("saves changed records, keeping the filter columns current", async () => {
    const { db } = database
    await insertRulebook(db, rulebook("draft", "draft"))
    await saveRulebookContent(db, hoaId, "draft", { ...content, rules: [], terms: [] })
    const [rule] = content.rules
    const [term] = content.terms
    if (!rule || !term) {
      throw new Error("The sample has rules and terms")
    }

    const [question] = content.questions
    await saveRulebookChanges(db, hoaId, "draft", { rules: [rule], terms: [term] })
    await saveRulebookChanges(db, hoaId, "draft", {
      rules: [{ ...rule, review: approved }],
      terms: [{ ...term, review: approved }],
      questions: question ? [{ ...question, answer: { option: 0, text: null, by: "admin", at: now } }] : [],
      settings: { ...content.settings, review: approved }
    })

    expect(await getRulebookRule(db, hoaId, "draft", rule.key)).toEqual({ ...rule, review: approved })
    expect(await getRulebookRule(db, hoaId, "draft", "declaration:0#missing")).toBeNull()
    expect((await db.select().from(rulebookRules)).map((row) => row.reviewStatus)).toEqual(["approved"])
    expect((await db.select().from(rulebookTerms)).map((row) => row.reviewStatus)).toEqual(["approved"])
    const saved = await getRulebookContent(db, hoaId, "draft")
    expect(saved?.settings.review).toEqual(approved)
    expect(saved?.questions.find((item) => item.id === question?.id)?.answer?.option).toBe(0)
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

  it("finds the published rulebook's rules file", async () => {
    const { db } = database
    await insertRulebook(db, rulebook("draft", "draft"))
    expect(await getPublishedRulesFile(db, hoaId)).toBeNull()

    await publishRulebook(db, hoaId, { rulebookId: "draft", userId: "admin", now })
    expect(await getPublishedRulesFile(db, hoaId)).toBeNull()

    const file = { fileKey: "hoas/demo-hoa/rulebooks/draft/rules.json", fileSha256: "f".repeat(64) }
    await recordRulebookFile(db, hoaId, "draft", file)
    expect(await getPublishedRulesFile(db, hoaId)).toEqual({ rulebookId: "draft", ...file })
  })
})
