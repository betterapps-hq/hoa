import type { Application } from "@/applications/application"
import { getDb } from "@/db/client.server"
import { getPublishedRulesFile, type RulesFileRef } from "@/db/rulebookContentRepository"
import { listPublishedRulebooks } from "@/db/rulebookRepository"
import { citedProvisions } from "@/projectTypes/answers"
import type { ProjectTypeDefinition } from "@/projectTypes/projectType"
import type { Review } from "@/review/reviewModel"
import { ruleChangesSince, type RulesUpdate } from "@/review/ruleChanges"
import { readRulesFile } from "@/rulebook/assemble"
import { rulebookKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

// Rulebook versions and applications (application-review.md, Rulebook versions): a review keeps the rulebook it read.
// While the homeowner can still change an application never submitted, a newer published rulebook that changes the
// rules its latest review applied asks for the review to run again before it's submitted. Once submitted, an
// application stays under the rulebook it was submitted with, so it never has an update.

async function readOrNull(ref: RulesFileRef) {
  try {
    return await readRulesFile(getBucket(), ref)
  } catch (error) {
    console.error(error)
    return null
  }
}

/** The published rulebook's version for each rulebook id, for saying which version a review read. */
export async function rulebookVersions(organizationId: string): Promise<ReadonlyMap<string, number | null>> {
  const rulebooks = await listPublishedRulebooks(getDb(), organizationId)
  return new Map(rulebooks.map((rulebook) => [rulebook.id, rulebook.version]))
}

/**
 * The published rulebook's changes to the rules an application's latest review applied; null when the review read the
 * published rulebook, nothing it applied changed, or the application was submitted.
 */
export async function rulesUpdateOf(
  organizationId: string,
  application: Pick<Application, "submittedReviewId">,
  review: Pick<Review, "rulebookId" | "rulesFileSha256" | "selected" | "request"> | null,
  definition: ProjectTypeDefinition | null
): Promise<RulesUpdate | null> {
  if (!review || application.submittedReviewId !== null) {
    return null
  }
  const published = await getPublishedRulesFile(getDb(), organizationId)
  if (!published || published.rulebookId === review.rulebookId) {
    return null
  }
  const [before, after, versions] = await Promise.all([
    readOrNull({ fileKey: rulebookKeys(organizationId, review.rulebookId).file, fileSha256: review.rulesFileSha256 }),
    readOrNull(published),
    rulebookVersions(organizationId)
  ])
  if (!before || !after) {
    return null
  }
  const on = new Date().toISOString().slice(0, 10)
  const changes = await ruleChangesSince(review, before, after, { cited: citedProvisions(definition), on })
  return changes.length > 0
    ? { version: versions.get(published.rulebookId) ?? null, publishedAt: published.publishedAt, changes }
    : null
}
