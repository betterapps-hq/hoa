import type { Database } from "@/db/database"
import { getRulebookContent, recordRulebookFile, type RulebookContent } from "@/db/rulebookContentRepository"
import { publishRulebook } from "@/db/rulebookRepository"
import type { ObjectBucket } from "@/storage/objects"
import { assembleRulesFile, loadRulebookRecords, writeRulesFile } from "./assemble"
import type { RulebookCoverage } from "./coverage"

// Publishing a draft (encoding.md, 12 and 13): allowed once every record is reviewed, no approved record has an open
// issue and every provision is covered. The rules file is assembled from the approved records, written to R2 and its
// hash stored on the rulebook, which supersedes the published one.

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Why a draft can't be published yet; empty when it can. */
export function publishBlockers(
  content: Pick<RulebookContent, "rules" | "terms" | "settings">,
  coverage: RulebookCoverage
) {
  const records = [...content.rules, ...content.terms]
  const unreviewed = records.filter((record) => record.review.status === "proposed").length
  const withIssues = [...records, content.settings].filter(
    (record) => record.review.status === "approved" && record.issues.some((issue) => issue.resolution === null)
  ).length
  return [
    ...(unreviewed > 0
      ? [`${plural(unreviewed, "rule or term still needs", "rules and terms still need")} review.`]
      : []),
    ...(content.settings.review.status === "proposed" ? ["The settings still need review."] : []),
    ...(withIssues > 0 ? [`${plural(withIssues, "approved record has", "approved records have")} open issues.`] : []),
    ...(coverage.uncovered.length > 0
      ? [`${plural(coverage.uncovered.length, "provision isn't", "provisions aren't")} covered by a rule or a reason.`]
      : [])
  ]
}

/** Publishes a draft: refuses while it's blocked, else writes the rules file and makes the draft the published one. */
export async function publishDraft(
  db: Database,
  bucket: ObjectBucket,
  hoaId: string,
  input: { rulebookId: string; userId: string; now: string }
) {
  const content = await getRulebookContent(db, hoaId, input.rulebookId)
  if (!content) {
    throw new Error("The draft has no records to publish.")
  }
  const blockers = publishBlockers(content, content.coverage)
  if (blockers.length > 0) {
    throw new Error(blockers.join(" "))
  }
  const assembled = await assembleRulesFile(await loadRulebookRecords(db, hoaId, input.rulebookId))
  const file = await writeRulesFile(bucket, hoaId, input.rulebookId, assembled)
  await recordRulebookFile(db, hoaId, input.rulebookId, file)
  const version = await publishRulebook(db, hoaId, input)
  return { version, ...file }
}
