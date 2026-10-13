import { citationHref, citedProvisionHref } from "@/features/documents/citationLink"
import type { JobFailure } from "@/jobs/job"
import type { RulebookRecords } from "@/rulebook/assemble"
import type { RecordRef } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { citationLabel, countOf } from "../rulebookRecords"

// What the draft review reads about a draft (encoding.md, UX, Draft review): how much is decided, what approving
// everything left would approve, and what the build skipped.

const isProposed = (record: { review: T.Review }) => record.review.status === "proposed"

/** How many of the draft's decisions are made: rules, terms, reasons for having no rule, answers and the settings. */
export function draftProgress(records: RulebookRecords) {
  const reasons = records.provisions.flatMap((provision) => (provision.noRule ? [provision.noRule] : []))
  const reviewed = [...records.rules, ...records.terms, ...reasons, records.settings]
  const total = reviewed.length + records.questions.length
  const decided =
    reviewed.filter((record) => !isProposed(record)).length +
    records.questions.filter((question) => question.answer !== null).length
  return { decided, total }
}

/** Everything still to review that approving can decide: questions need answers, so they're left out. */
export function approvableRefs(records: RulebookRecords) {
  const rules = records.rules.filter(isProposed).map((rule): RecordRef => ({ type: "rule", key: rule.key }))
  const terms = records.terms.filter(isProposed).map((term): RecordRef => ({ type: "term", key: term.key }))
  const reasons = records.provisions
    .filter((provision) => provision.noRule?.review.status === "proposed")
    .map((provision): RecordRef => ({ type: "provision", key: provision.key }))
  const settings: RecordRef[] = isProposed(records.settings) ? [{ type: "settings" }] : []
  return { rules, terms, reasons, settings, all: [...terms, ...rules, ...settings, ...reasons] }
}

/**
 * Something the build skipped, in a few words: where ("Declaration 21", linked to it in the documents), and what
 * ("2 rules not drafted"); a skip of the whole draft has no place.
 */
export type SkippedPart = {
  id: string
  /** The job stage that skipped it. */
  stage: string
  place: { label: string; href: string } | null
  text: string
}

// What a stage didn't do, said of the section it started at, or of the whole draft.
const sectionWords: Partial<Record<string, string>> = {
  "find-rules": "not read for rules",
  vocabulary: "its terms not named",
  "structure-rules": "some rules not drafted"
}
const draftWords: Partial<Record<string, string>> = {
  "vocabulary-merge": "Terms not combined into one vocabulary",
  consolidate: "Rules not checked for conflicts"
}

/**
 * Where a skipped item is, from its id: one rule ("declaration:21#fine"), a batch of rules from one on (its key with
 * ":first-pass" or ":retry-1"), a section, a document, or nothing for the build as a whole.
 */
function placeOf(itemId: string, records: Pick<RulebookRecords, "provisions" | "documents">) {
  const base = itemId.replace(/:(first-pass|retry-\d+)$/, "")
  const [provisionKey = base, aspect] = base.split("#")
  const provision = records.provisions.find((found) => found.key === provisionKey)
  const href = citedProvisionHref({ provisionKey, anchors: provision?.anchors ?? [] })
  if (aspect !== undefined && base === itemId) {
    return { kind: "rule" as const, label: citationLabel(provisionKey), href }
  }
  if (provision) {
    return { kind: "section" as const, label: citationLabel(provisionKey), href }
  }
  const document = records.documents.find((found) => found.key === base)
  return document ? { kind: "document" as const, label: document.title, href: citationHref(document.key) } : null
}

/**
 * What the build that made the draft skipped (encoding.md, UX, Draft review), one line per place and kind: what's in
 * those sections may be missing from the draft.
 */
export function skippedParts(
  failures: readonly JobFailure[],
  records: Pick<RulebookRecords, "provisions" | "documents">
): SkippedPart[] {
  const parts = new Map<string, { place: ReturnType<typeof placeOf>; stage: string; count: number }>()
  for (const failure of failures) {
    const place = placeOf(failure.itemId, records)
    const id = `${failure.stage} ${place?.kind ?? ""} ${place?.label ?? ""}`
    const part = parts.get(id) ?? { place, stage: failure.stage, count: 0 }
    part.count += 1
    parts.set(id, part)
  }
  return [...parts].map(([id, { place, stage, count }]) => {
    const what = (() => {
      switch (place?.kind) {
        case "rule":
          return `${countOf(count, "rule", "rules")} not drafted`
        case "section":
          return sectionWords[stage] ?? "not finished"
        case "document":
          return stage === "defined-terms" ? "defined terms not read" : "not finished"
        case undefined:
          return null
      }
    })()
    return place && what
      ? { id, stage, place: { label: place.label, href: place.href }, text: what }
      : { id, stage, place: null, text: draftWords[stage] ?? "Part of the draft not finished" }
  })
}
