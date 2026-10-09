import { match } from "ts-pattern"
import type { PageHighlight } from "@/features/documents/DocumentViewer/DocumentViewer.utils"
import type { CoveragePassage, DocumentCoverage, EncodedValue } from "@/rulebook/coverage"
import type { Vocabulary } from "@/schema/vocabulary"
import { coverageKindLabels, coverageKindStyles } from "../coverageKinds"
import { amountText, citationLabel, readableLabel } from "../rulebookRecords"

// The coverage reader (encoding.md, UX, Coverage): a document's passages on its pages, its gaps, and how each is named.

const passagesOf = (document: DocumentCoverage) => document.articles.flatMap((article) => article.passages)

/** Where a passage is on its upload's pages: a provision's anchors, or the outside text's own place. */
export function placesOf(passage: CoveragePassage) {
  if (passage.type === "outside") {
    return [passage.passage]
  }
  return passage.part === "main" ? passage.provision.anchors : []
}

/**
 * The upload a document was read from: the file most of its provisions' anchors point into. Null for a document whose
 * provisions aren't linked to any upload's pages, such as one that hasn't been built from its upload yet.
 */
export function fileOf(document: DocumentCoverage): string | null {
  const counts = new Map<string, number>()
  for (const passage of passagesOf(document)) {
    for (const place of placesOf(passage)) {
      counts.set(place.fileId, (counts.get(place.fileId) ?? 0) + 1)
    }
  }
  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Every passage on the file's pages, highlighted in its kind's style; choosing one chooses the passage. */
export function highlightsOf(document: DocumentCoverage, fileId: string): PageHighlight[] {
  return passagesOf(document).flatMap((passage) =>
    placesOf(passage)
      .filter((place) => place.fileId === fileId)
      .map((place) => ({
        documentId: fileId,
        pageIndex: place.page,
        range: { start: place.start, end: place.end },
        id: passage.key,
        tone: coverageKindStyles[passage.kind].mark
      }))
  )
}

/** The page a passage starts on in the file, or null when it isn't on the file's pages. */
export const pageOfPassage = (passage: CoveragePassage, fileId: string) =>
  placesOf(passage)
    .filter((place) => place.fileId === fileId)
    .map((place) => place.page)
    .toSorted((a, b) => a - b)[0] ?? null

/** The passages on one page of the file, in the order they start there. */
export const passagesOnPage = (document: DocumentCoverage, fileId: string, page: number) =>
  passagesOf(document)
    .flatMap((passage) => {
      const place = placesOf(passage).find((item) => item.fileId === fileId && item.page === page)
      return place ? [{ passage, start: place.start }] : []
    })
    .toSorted((a, b) => a.start - b.start)
    .map((item) => item.passage)

/** The passages a reviewer has to act on: provisions nothing covers and text outside any provision, in order. */
export function gapsOf(document: DocumentCoverage) {
  return passagesOf(document).filter(
    (passage) =>
      passage.kind === "outside" ||
      (passage.kind === "uncovered" && passage.type === "provision" && passage.part === "main")
  )
}

/** A passage's short label: "3.1(a)", "Article 4", "3.1, end", "Page 12". */
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
