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

const hoaId = "demo-hoa"
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
    const [declaration, bylaws] = sample.documents
    if (!declaration || !bylaws) {
      throw new Error("The sample has documents")
    }
    await db.update(governingDocuments).set({ key: declaration.key, document: declaration })
    await saveReferencedDocuments(db, hoaId, [{ id: "bylaws", document: { ...bylaws, edition: null } }], "system", now)
    await saveProvisions(db, hoaId, upload.id, sample.provisions.slice(0, 3))
    await saveSections(db, hoaId, [
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
      hoaId,
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
    await db.insert(rules).values({ id: "old-rule", hoaId, rulebookId: "rb", ruleKey: "old", rule: {} })
    await saveRulebookContent(db, hoaId, "rb", {
      settings: sample.settings,
      coverage: { provisions: 3, uncovered: [] },
      rules: sample.rules.slice(0, 2),
      terms: sample.terms.slice(0, 2),
      questions: sample.questions.slice(0, 1)
    })
    const application = await createApplication(db, {
      hoaId,
      projectTypeId: null,
      answers: null,
      description: null,
      createdBy: "h",
      now,
      deleteAfter: now
    })
    await updateApplication(db, hoaId, application.id, {
      status: "submitted",
      reviewId: "review",
      submittedReviewId: "review",
      submittedAt: now
    })
    await saveReviewSummary(db, {
      id: "review",
      hoaId,
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
      newJob({ id: "build", hoaId, kind: "rulebook-build", subjectId: "rb", now }),
      newJob({ id: "review-job", hoaId, kind: "application-review", subjectId: application.id, now }),
      newJob({ id: "ingest", hoaId, kind: "document-ingest", subjectId: upload.id, now })
    ]) {
      await insertJob(db, job)
    }

    const { bucket, stored } = createMemoryBucket(1)
    const kept = [
      `hoas/${hoaId}/governing/${upload.id}/pages/1.json`,
      `hoas/${hoaId}/jobs/ingest/ocr/pages.json`,
      `hoas/${hoaId}/applications/${application.id}/files/f/source.pdf`,
      `hoas/${hoaId}/cache/encode/abc.json`
    ]
    const removed = [
      `hoas/${hoaId}/rulebooks/rb/rules.json`,
      `hoas/${hoaId}/jobs/build/encode/u1.json`,
      `hoas/${hoaId}/jobs/build/merge/draft.json`,
      `hoas/${hoaId}/jobs/review-job/facts/g1.json`,
      `hoas/${hoaId}/governing/${upload.id}/sections/${upload.id}:0.md`,
      `hoas/${hoaId}/applications/${application.id}/reviews/review.json`
    ]
    for (const key of [...kept, ...removed]) {
      await bucket.put(key, "{}")
    }

    expect(await resetRulesData(db, bucket)).toEqual({ rulebooks: 1, reviews: 1, objects: removed.length })

    expect([...stored.keys()].toSorted()).toEqual(kept.toSorted())
    expect(await db.select().from(rulebooks)).toEqual([])
    expect(await db.select().from(rules)).toEqual([])
    expect(await db.select().from(sections)).toEqual([])
    expect(await getRulebookContent(db, hoaId, "rb")).toBeNull()
    expect(await listProvisions(db, hoaId, [upload.id])).toEqual([])
    expect(await listDocumentRecords(db, hoaId)).toEqual([])
    expect((await listGoverningDocuments(db, hoaId)).map((document) => document.id)).toEqual([upload.id])
    expect(await db.select({ id: jobs.id }).from(jobs)).toEqual([{ id: "ingest" }])
    expect(await getApplication(db, hoaId, application.id)).toMatchObject({
      status: "draft",
      reviewId: null,
      submittedReviewId: null,
      submittedAt: null
    })
  })
})
