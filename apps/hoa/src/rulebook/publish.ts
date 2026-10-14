import type { Database } from "@/db/database"
import { recordRulebookFile } from "@/db/rulebookContentRepository"
import { publishRulebook } from "@/db/rulebookRepository"
import { validateRulebook } from "@/schema/validate"
import type { ObjectBucket } from "@/storage/objects"
import { assembleRulesFile, fileRecords, loadRulebookRecords, writeRulesFile, type RulebookRecords } from "./assemble"
import { coverageOf } from "./coverage"
import { isBlocking } from "./review"

// Publishing a draft (encoding.md, 12 and 13): allowed once every record is reviewed, no approved record has an open
// issue, every provision is covered and the approved records make a valid rules file. The rules file is assembled from
// the approved records, written to R2 and its hash stored on the rulebook, which supersedes the published one.

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Why a draft can't be published yet; empty when it can. */
export function publishBlockers(records: RulebookRecords) {
  const reviewable = [...records.rules, ...records.terms]
  const unreviewed = reviewable.filter((record) => record.review.status === "proposed").length
  const unreviewedReasons = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed")
  const withIssues = [...reviewable, records.settings].filter(
    (record) =>
      record.review.status === "approved" &&
      record.issues.some((issue) => issue.resolution === null && isBlocking(issue.code))
  ).length
  const { uncovered } = coverageOf(records)
  // Until every record is reviewed, the approved ones naming the rest is expected, not a problem.
  const problems = unreviewed === 0 ? validateRulebook(fileRecords(records)) : []
  return [
    ...(unreviewed > 0
      ? [`${plural(unreviewed, "rule or term still needs", "rules and terms still need")} review.`]
      : []),
    ...(records.settings.review.status === "approved" ? [] : ["The settings still need review."]),
    ...(unreviewedReasons.length > 0
      ? [
          `${plural(unreviewedReasons.length, "reason for having no rule still needs", "reasons for having no rule still need")} review.`
        ]
      : []),
    ...(withIssues > 0 ? [`${plural(withIssues, "approved record has", "approved records have")} open issues.`] : []),
    ...(uncovered.length > 0
      ? [`${plural(uncovered.length, "provision isn't", "provisions aren't")} covered by a rule or a reason.`]
      : []),
    ...(problems.length > 0
      ? [
          `The approved records would make a rules file with ${plural(problems.length, "problem", "problems")}, such as ${problems[0]?.recordKey}: ${problems[0]?.message}.`
        ]
      : [])
  ]
}

/** Publishes a draft: refuses while it's blocked, else writes the rules file and makes the draft the published one. */
export async function publishDraft(
  db: Database,
  bucket: ObjectBucket,
  organizationId: string,
  input: { rulebookId: string; userId: string; now: string }
) {
  const records = await loadRulebookRecords(db, organizationId, input.rulebookId)
  const blockers = publishBlockers(records)
  if (blockers.length > 0) {
    throw new Error(blockers.join(" "))
  }
  const assembled = await assembleRulesFile(records)
  const file = await writeRulesFile(bucket, organizationId, input.rulebookId, assembled)
  await recordRulebookFile(db, organizationId, input.rulebookId, file)
  const version = await publishRulebook(db, organizationId, input)
  return { version, ...file }
}
