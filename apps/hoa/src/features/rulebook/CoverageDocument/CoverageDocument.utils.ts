import { match } from "ts-pattern"
import type { CoveragePassage, DocumentCoverage, EncodedValue } from "@/rulebook/coverage"
import type { Vocabulary } from "@/schema/vocabulary"
import { coverageKindLabels } from "../coverageKinds"
import { amountText, citationLabel, readableLabel } from "../rulebookRecords"

// The coverage tab's document view (encoding.md, UX, Coverage): a document's passages, its gaps, and how each is named.

/** The passages a reviewer has to act on: provisions nothing covers and text outside any provision, in order. */
export function gapsOf(document: DocumentCoverage) {
  return document.articles.flatMap((article) =>
    article.passages.filter(
      (passage) =>
        passage.kind === "outside" ||
        (passage.kind === "uncovered" && passage.type === "provision" && passage.part === "main")
    )
  )
}

/** The element id of a passage's row. */
export const passageId = (key: string) => `coverage-passage-${key}`

/** A passage's short label, as a coverage report's line number: "3.1(a)", "Article 4", "3.1, end", "Page 12". */
export const passageLabel = (passage: CoveragePassage) =>
  match(passage)
    .with({ type: "outside" }, ({ passage: outside }) => `Page ${outside.page}`)
    .with({ part: "main" }, ({ provision }) => readableLabel(provision.label))
    .with({ part: "wrap-up" }, ({ provision }) => `${readableLabel(provision.label)}, end`)
    .exhaustive()

/** A passage's accessible name: its full label and what covers it. */
export const passageName = (passage: CoveragePassage) =>
  match(passage)
    .with({ type: "outside" }, ({ passage: outside, kind }) => `Page ${outside.page}: ${coverageKindLabels[kind]}`)
    .with({ part: "main" }, ({ provision, kind }) => `${citationLabel(provision.key)}: ${coverageKindLabels[kind]}`)
    .with(
      { part: "wrap-up" },
      ({ provision, kind }) => `${citationLabel(provision.key)}, end: ${coverageKindLabels[kind]}`
    )
    .exhaustive()

/** A value a rule encodes, in words: "55 years", "2/3", "22:00". */
export const valueText = (value: EncodedValue, vocabulary: Vocabulary) =>
  match(value)
    .with({ type: "amount" }, ({ value: amount, unit }) => amountText(amount, unit, vocabulary))
    .with({ type: "number" }, ({ value: number }) => String(number))
    .with({ type: "fraction" }, ({ numerator, denominator }) => `${numerator}/${denominator}`)
    .with({ type: "date" }, { type: "month-day" }, { type: "time" }, ({ value: text }) => text)
    .exhaustive()

/** A text split at its marks, each piece with its offset, for rendering marked runs. */
export function splitAtMarks<M extends { start: number; end: number }>(text: string, marks: readonly M[]) {
  const pieces: { start: number; text: string; mark: M | null }[] = []
  let at = 0
  for (const mark of marks) {
    if (mark.start > at) {
      pieces.push({ start: at, text: text.slice(at, mark.start), mark: null })
    }
    pieces.push({ start: mark.start, text: text.slice(mark.start, mark.end), mark })
    at = mark.end
  }
  if (at < text.length) {
    pieces.push({ start: at, text: text.slice(at), mark: null })
  }
  return pieces
}
