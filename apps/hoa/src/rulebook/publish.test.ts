// @vitest-environment node
import { match } from "ts-pattern"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getPublishedRulesFile, saveRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebook } from "@/db/rulebookRepository"
import {
  builtContent,
  builtRecords,
  builtRule,
  hoaId,
  insertBuildingRulebook,
  now,
  seedUpload
} from "@/tests/builtDraft"
import { createMemoryBucket } from "@/tests/memoryBucket"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { readRulesFile } from "./assemble"
import { publishBlockers, publishDraft } from "./publish"
import { saveBuiltDraft } from "./saveDraft"

const proposed = { status: "proposed" as const, by: null, at: null, note: null }
const openIssue = { code: "undefined-term" as const, message: "gazebo isn't a term", related: [], resolution: null }

describe("publishBlockers", () => {
  it("asks for every record reviewed, approved records without open issues, every provision covered and a valid file", () => {
    expect(publishBlockers(builtRecords)).toEqual([])
    const blocked = {
      ...builtRecords,
      settings: { ...builtRecords.settings, review: proposed },
      rules: [
        { ...builtRule, review: proposed },
        { ...builtRule, issues: [openIssue] }
      ],
      provisions: builtRecords.provisions.map((provision) =>
        match(provision.key)
          .with("rules:2", () => ({
            ...provision,
            noRule: { reason: "heading" as const, note: null, review: proposed }
          }))
          .with("rules:3", () => ({ ...provision, noRule: null }))
          .otherwise(() => provision)
      )
    }
    expect(publishBlockers(blocked)).toEqual([
      "1 rule or term still needs review.",
      "The settings still need review.",
      "1 reason for having no rule still needs review.",
      "1 approved record has open issues.",
      "1 provision isn't covered by a rule or a reason."
    ])
    // Once everything is reviewed, the approved records must also make a valid rules file.
    const reviewed = {
      ...blocked,
      settings: builtRecords.settings,
      rules: [builtRule],
      provisions: builtRecords.provisions
    }
    const withoutReason = {
      ...reviewed,
      provisions: reviewed.provisions.map((provision) =>
        provision.key === "rules:3" ? { ...provision, noRule: null } : provision
      )
    }
    expect(publishBlockers(withoutReason)).toEqual([
      "1 provision isn't covered by a rule or a reason.",
      "The approved records would make a rules file with 1 problem, such as rules:3: nothing cites it, and it has no reason for having no rule."
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
      publishedAt: expect.any(String),
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
