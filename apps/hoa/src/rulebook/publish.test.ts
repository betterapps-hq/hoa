// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getPublishedRulesFile, saveRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebook } from "@/db/rulebookRepository"
import { builtContent, builtRule, hoaId, insertBuildingRulebook, now, seedUpload } from "@/tests/builtDraft"
import { createMemoryBucket } from "@/tests/memoryBucket"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { readRulesFile } from "./assemble"
import { publishBlockers, publishDraft } from "./publish"
import { saveBuiltDraft } from "./saveDraft"

const proposed = { status: "proposed" as const, by: null, at: null, note: null }
const openIssue = { code: "undefined-term" as const, message: "gazebo isn't a term", related: [], resolution: null }

describe("publishBlockers", () => {
  it("asks for every record reviewed, approved records without open issues, and every provision covered", () => {
    expect(publishBlockers(builtContent, builtContent.coverage)).toEqual([])
    const blocked = {
      ...builtContent,
      settings: { ...builtContent.settings, review: proposed },
      rules: [
        { ...builtRule, review: proposed },
        { ...builtRule, issues: [openIssue] }
      ]
    }
    expect(publishBlockers(blocked, { provisions: 5, uncovered: ["rules:3", "rules:2"] })).toEqual([
      "1 rule or term still needs review.",
      "The settings still need review.",
      "1 approved record has open issues.",
      "2 provisions aren't covered by a rule or a reason."
    ])
  })
})

describe("publishDraft", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("writes the rules file, stores its hash and supersedes the published rulebook", async () => {
    const { db } = database
    const { bucket } = createMemoryBucket()
    const documents = await seedUpload(db)
    await insertBuildingRulebook(db, "first")
    await saveBuiltDraft(db, hoaId, { rulebookId: "first", documents, content: builtContent, recordedBy: "admin", now })
    const first = await publishDraft(db, bucket, hoaId, { rulebookId: "first", userId: "admin", now })
    expect(first.version).toBe(1)

    await insertBuildingRulebook(db, "second")
    await saveBuiltDraft(db, hoaId, {
      rulebookId: "second",
      documents,
      content: builtContent,
      recordedBy: "admin",
      now
    })
    const second = await publishDraft(db, bucket, hoaId, { rulebookId: "second", userId: "admin", now })

    expect(second).toMatchObject({ version: 2, fileKey: `hoas/${hoaId}/rulebooks/second/rules.json` })
    expect(second.fileSha256).toBe(first.fileSha256)
    expect(await getPublishedRulesFile(db, hoaId)).toEqual({
      rulebookId: "second",
      fileKey: second.fileKey,
      fileSha256: second.fileSha256
    })
    expect((await getRulebook(db, hoaId, "first"))?.status).toBe("superseded")
    const file = await readRulesFile(bucket, second)
    expect(file.rules.map((rule) => rule.key)).toEqual(["rules:1#max-height"])
    expect(file.documents.map((document) => document.key)).toEqual(["by-laws", "declaration", "rules"])
  })

  it("refuses a draft that isn't ready", async () => {
    const { db } = database
    const { bucket } = createMemoryBucket()
    await seedUpload(db)
    await insertBuildingRulebook(db, "draft", "draft")
    await expect(publishDraft(db, bucket, hoaId, { rulebookId: "draft", userId: "admin", now })).rejects.toThrow(
      "no records"
    )
    await saveRulebookContent(db, hoaId, "draft", { ...builtContent, rules: [{ ...builtRule, review: proposed }] })
    await expect(publishDraft(db, bucket, hoaId, { rulebookId: "draft", userId: "admin", now })).rejects.toThrow(
      "still needs review"
    )
  })
})
