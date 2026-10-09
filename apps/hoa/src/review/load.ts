import type * as T from "@/schema/types"
import { rulebookVocabulary } from "./documentTypes"

// Load (application-review.md, Load): the request skeleton the review fills in. An application is judged as of its
// submission date (the request type's governing date property); before submission, as of the evaluation date, and
// the review is provisional.

/** The calendar date of an instant in a time zone. */
export function localDate(timestamp: T.Timestamp, zone: string): T.IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(timestamp))
    .reduce<Record<string, string>>((found, part) => ({ ...found, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

export type SkeletonInput = {
  organizationId: string
  rulesFile: T.RulesFile
  requestType: T.TermKey
  /** The submission date, or null before the application is submitted. */
  submittedOn: T.IsoDate | null
  now: T.Timestamp
}

/** The request's dates, its governing date fact, and whether the review is provisional. */
export function requestSkeleton(input: SkeletonInput) {
  const evaluationDate = localDate(input.now, input.rulesFile.settings.clauses.time.zone)
  const governingDate = input.submittedOn ?? evaluationDate
  const governingProperty = rulebookVocabulary(input.rulesFile).requestOf(input.requestType)?.governingDate ?? null
  const facts: T.Fact[] =
    governingProperty && input.submittedOn
      ? [
          {
            entity: "request",
            property: governingProperty,
            state: "known",
            value: { type: "date", value: input.submittedOn },
            candidates: [],
            complete: null,
            stated: null,
            evidence: [],
            confidence: null,
            provenance: { by: "system", at: input.now }
          }
        ]
      : []
  return {
    organizationId: input.organizationId,
    type: input.requestType,
    governingDate,
    evaluationDate,
    lot: "lot",
    facts,
    provisional: input.submittedOn === null
  }
}
