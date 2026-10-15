// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createMemoryBucket } from "@/tests/memoryBucket"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { createApplication, getApplication, saveReviewSummary, updateApplication } from "./applicationRepository"
import {
  createGoverningDocument,
  listDocumentRecords,
  listGoverningDocuments,
  listProvisions,
  saveProvisions,
  saveReferencedDocuments,
  saveSections
} from "./documentRepository"
import { insertJob, newJob } from "./jobRepository"
import { resetRulesData } from "./resetRules"
import { getRulebookContent, saveRulebookContent } from "./rulebookContentRepository"
import { insertRulebook } from "./rulebookRepository"
import { governingDocuments, jobs, rulebooks, rules, sections } from "./schema"

const organizationId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"
const sample = sampleRulesFile()

describe("resetRulesData", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("empties rulebooks, sections, provisions and reviews with their objects, and keeps uploads and applications", async () => {
    const { db } = database
    const upload = await createGoverningDocument(db, {
      organizationId,
      kind: "declaration",
      title: "Declaration",
      effectiveDate: null,
      fileName: "declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: "admin",
      uploadedAt: now
    })
    const [declaration, bylaws] = sample.documents
    if (!declaration || !bylaws) {
      throw new Error("The sample has documents")
    }
    await db.update(governingDocuments).set({ key: declaration.key, document: declaration })
    await saveReferencedDocuments(
      db,
      organizationId,
      [{ id: "bylaws", document: { ...bylaws, edition: null } }],
      "system",
      now
    )
    await saveProvisions(db, organizationId, upload.id, sample.provisions.slice(0, 3))
    await saveSections(db, organizationId, [
      {
        id: `${upload.id}:0`,
        documentId: upload.id,
        ordinal: 0,
        number: null,
        heading: "Article 1",
        kind: "body",
        parentId: null,
        pageStart: 1,
        pageEnd: 1,
        startOffset: 0,
        endOffset: 10,
        references: []
      }
    ])
    await insertRulebook(db, {
      id: "rb",
      organizationId,
      version: null,
      status: "draft",
      error: null,
      catalogVersion: 0,
      sourceDocumentIds: [upload.id],
      jobId: "build",
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    })
    await db.insert(rules).values({ id: "old-rule", organizationId, rulebookId: "rb", ruleKey: "old", rule: {} })
    await saveRulebookContent(db, organizationId, "rb", {
      settings: sample.settings,
      coverage: { provisions: 3, uncovered: [] },
      rules: sample.rules.slice(0, 2),
      terms: sample.terms.slice(0, 2),
      questions: sample.questions.slice(0, 1)
    })
    const application = await createApplication(db, {
      organizationId,
      projectTypeId: null,
      answers: null,
      description: null,
      createdBy: "h",
      now,
      deleteAfter: now
    })
    await updateApplication(db, organizationId, application.id, {
      status: "submitted",
      reviewId: "review",
      submittedReviewId: "review",
      submittedAt: now
    })
    await saveReviewSummary(db, {
      id: "review",
      organizationId,
      applicationId: application.id,
      jobId: "review-job",
      rulebookId: "rb",
      rulesFileSha256: null,
      recommendation: "approve",
      costUsd: 0,
      sessionId: "review-job",
      createdAt: now
    })
    for (const job of [
      newJob({ id: "build", organizationId, kind: "rulebook-build", subjectId: "rb", now }),
      newJob({ id: "review-job", organizationId, kind: "application-review", subjectId: application.id, now }),
      newJob({ id: "ingest", organizationId, kind: "document-ingest", subjectId: upload.id, now })
    ]) {
      await insertJob(db, job)
    }

    const { bucket, stored } = createMemoryBucket(1)
    const kept = [
      `hoas/${organizationId}/governing/${upload.id}/pages/1.json`,
      `hoas/${organizationId}/jobs/ingest/ocr/pages.json`,
      `hoas/${organizationId}/applications/${application.id}/files/f/source.pdf`,
      `hoas/${organizationId}/cache/encode/abc.json`
    ]
    const removed = [
      `hoas/${organizationId}/rulebooks/rb/rules.json`,
      `hoas/${organizationId}/jobs/build/encode/u1.json`,
      `hoas/${organizationId}/jobs/build/merge/draft.json`,
      `hoas/${organizationId}/jobs/review-job/facts/g1.json`,
      `hoas/${organizationId}/governing/${upload.id}/sections/${upload.id}:0.md`,
      `hoas/${organizationId}/applications/${application.id}/reviews/review.json`
    ]
    for (const key of [...kept, ...removed]) {
      await bucket.put(key, "{}")
    }

    expect(await resetRulesData(db, bucket)).toEqual({ rulebooks: 1, reviews: 1, objects: removed.length })

    expect([...stored.keys()].toSorted()).toEqual(kept.toSorted())
    expect(await db.select().from(rulebooks)).toEqual([])
    expect(await db.select().from(rules)).toEqual([])
    expect(await db.select().from(sections)).toEqual([])
    expect(await getRulebookContent(db, organizationId, "rb")).toBeNull()
    expect(await listProvisions(db, organizationId, [upload.id])).toEqual([])
    expect(await listDocumentRecords(db, organizationId)).toEqual([])
    expect((await listGoverningDocuments(db, organizationId)).map((document) => document.id)).toEqual([upload.id])
    expect(await db.select({ id: jobs.id }).from(jobs)).toEqual([{ id: "ingest" }])
    expect(await getApplication(db, organizationId, application.id)).toMatchObject({
      status: "draft",
      reviewId: null,
      submittedReviewId: null,
      submittedAt: null
    })
  })
})
