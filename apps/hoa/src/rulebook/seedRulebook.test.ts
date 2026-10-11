// @vitest-environment node
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { chunk, runBatch } from "@/db/batching"
import type { Database } from "@/db/database"
import { getProvision, listDocumentRecords, listGoverningDocuments } from "@/db/documentRepository"
import { getPublishedRulesFile } from "@/db/rulebookContentRepository"
import { getRulebook, insertRulebook } from "@/db/rulebookRepository"
import { hoas } from "@/db/schema"
import { builtRecords, now } from "@/tests/builtDraft"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { assembleRulesFile, loadRulebookRecords } from "./assemble"
import { seedRulebook } from "./seedRulebook"

// A small rulebook (one rule over a few provisions), so the seed's SQL runs in seconds; the sample's own seed is the same
// statements over more rows.
const { organization } = builtRecords
const ruleProvision = builtRecords.provisions.find((provision) => provision.key === "rules:1")

/** Runs the seed's SQL in batches of a few hundred statements: one batch of them all can reset the local runtime's
 * connection when other test files load it too. */
async function run(db: Database, statements: readonly string[]) {
  for (const group of chunk(statements, 250)) {
    await runBatch(
      db,
      group.map((statement) => db.run(sql.raw(statement)))
    )
  }
}

describe("seedRulebook", { timeout: 60_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
    await database.db
      .insert(hoas)
      .values({ id: organization.id, name: organization.name, slug: "sample", settings: {}, createdAt: now })
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("publishes a rules file whose D1 rows assemble to the same file", async () => {
    const { db } = database
    await insertRulebook(db, {
      id: "earlier",
      hoaId: organization.id,
      version: 1,
      status: "published",
      error: null,
      catalogVersion: 1,
      sourceDocumentIds: [],
      jobId: "job",
      createdAt: now,
      publishedBy: "admin",
      publishedAt: now
    })
    const seed = await seedRulebook({
      file: (await assembleRulesFile(builtRecords)).file,
      organization,
      rulebookId: "sample-declaration",
      approvedBy: "admin",
      now
    })

    await run(db, seed.statements)
    // Running it again replaces the same rulebook.
    await run(db, seed.statements)

    const reassembled = await assembleRulesFile(await loadRulebookRecords(db, organization.id, "sample-declaration"))
    expect(reassembled.sha256).toBe(seed.sha256)
    expect(reassembled.json).toBe(seed.json)
    expect(await getPublishedRulesFile(db, organization.id)).toEqual({
      rulebookId: "sample-declaration",
      publishedAt: expect.any(String),
      fileKey: "hoas/demo-hoa/rulebooks/sample-declaration/rules.json",
      fileSha256: seed.sha256
    })
    expect(await getRulebook(db, organization.id, "sample-declaration")).toMatchObject({
      status: "published",
      version: 2
    })
    expect((await getRulebook(db, organization.id, "earlier"))?.status).toBe("superseded")

    // The documents have no files, so the uploads list doesn't show them.
    expect(await listGoverningDocuments(db, organization.id)).toEqual([])
    const documents = await listDocumentRecords(db, organization.id)
    expect(documents.map((record) => [record.id, record.document.edition === null])).toContainEqual([
      "sample-declaration:by-laws",
      true
    ])
    expect((await getProvision(db, organization.id, "rules:1"))?.heading).toBe(ruleProvision?.heading)
  })
})
