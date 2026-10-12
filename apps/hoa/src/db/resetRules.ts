import { inArray, isNull } from "drizzle-orm"
import { applicationKeys, governingKeys, jobOutputPrefix, rulebookKeys } from "@/storage/keys"
import { chunk, runBatch } from "./batching"
import type { Database } from "./database"
import {
  applications,
  governingDocuments,
  jobs,
  provisions,
  reviews,
  rulebookQuestions,
  rulebookRules,
  rulebooks,
  rulebookTerms,
  rules,
  sections
} from "./schema"

// The rules data reset (implementation-plan.md, 0.4): empties everything builds, the sample seed and reviews wrote, in
// every organization, so the next build starts clean. Uploaded documents and their pages, applications and their
// files, model caches and settings stay. Applications go back to drafts, since their reviews are gone.

/** The part of an R2 bucket the reset uses; the R2 binding fits it. */
export type ListableBucket = {
  list(options: {
    prefix: string
    cursor?: string
  }): Promise<{ objects: { key: string }[] } & ({ truncated: true; cursor: string } | { truncated: false })>
  delete(keys: string[]): Promise<void>
}

const ruleJobKinds = ["rulebook-build", "application-review"]

async function listKeys(bucket: ListableBucket, prefix: string) {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list(cursor === undefined ? { prefix } : { prefix, cursor })
    keys.push(...page.objects.map((object) => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return keys
}

export async function resetRulesData(db: Database, bucket: ListableBucket) {
  const [rulebookRows, sectionRows, reviewRows, jobRows] = await Promise.all([
    db.select({ hoaId: rulebooks.hoaId, id: rulebooks.id }).from(rulebooks),
    db.select({ hoaId: sections.hoaId, documentId: sections.documentId, id: sections.id }).from(sections),
    db.select({ hoaId: reviews.hoaId, applicationId: reviews.applicationId, id: reviews.id }).from(reviews),
    db.select({ hoaId: jobs.hoaId, id: jobs.id }).from(jobs).where(inArray(jobs.kind, ruleJobKinds))
  ])
  const prefixes = [
    ...rulebookRows.map((row) => rulebookKeys(row.hoaId, row.id).root),
    ...jobRows.map((row) => jobOutputPrefix(row.hoaId, row.id))
  ]
  const keys = [
    ...sectionRows.map((row) => governingKeys(row.hoaId, row.documentId).sectionText(row.id)),
    ...reviewRows.map((row) => applicationKeys(row.hoaId, row.applicationId).review(row.id)),
    ...(await Promise.all(prefixes.map((prefix) => listKeys(bucket, prefix)))).flat()
  ]
  // Objects first: their keys come from the rows, so a failure part way leaves the rows to find them again.
  for (const group of chunk(keys, 1000)) {
    await bucket.delete(group)
  }
  await runBatch(db, [
    db.delete(rulebookRules),
    db.delete(rulebookTerms),
    db.delete(rulebookQuestions),
    db.delete(rules),
    db.delete(rulebooks),
    db.delete(sections),
    db.delete(provisions),
    db.delete(reviews),
    db.delete(jobs).where(inArray(jobs.kind, ruleJobKinds)),
    db.delete(governingDocuments).where(isNull(governingDocuments.fileName)),
    db.update(governingDocuments).set({ key: null, document: null }),
    db
      .update(applications)
      .set({ status: "draft", reviewId: null, submittedReviewId: null, submittedAt: null, decision: null })
  ])
  return { rulebooks: rulebookRows.length, reviews: reviewRows.length, objects: keys.length }
}
