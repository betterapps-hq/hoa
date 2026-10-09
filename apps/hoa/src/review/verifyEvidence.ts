import type * as T from "@/schema/types"
import { matchQuote } from "@/text/quote"

// Evidence verification (application-review.md, Normalize): every evidence quote is looked for on the page it cites.
// A page's text here is what the models read for it: its OCR text, the text near a picture and its images'
// descriptions.

/** The text of a cited page; a null page means the whole file. Null when the file or page doesn't exist. */
export type PageTexts = (fileId: string, page: number | null) => string | null

/** Whether one piece of evidence is found where it says. */
export function isFound(evidence: T.Evidence, pageText: PageTexts) {
  const text = evidence.quote ? pageText(evidence.fileId, evidence.page) : null
  return text !== null && evidence.quote !== null && matchQuote(evidence.quote, text).status !== "not-found"
}

/** How many of the evidence quotes are found on their pages. */
export function verifyEvidence(evidence: readonly T.Evidence[], pageText: PageTexts) {
  const found = evidence.filter((item) => isFound(item, pageText)).length
  return { total: evidence.length, found }
}
