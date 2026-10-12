import { normalizeForMatching } from "@/ocr/page"

// Finding a quote in the text it cites (application-review.md, Normalize: evidence verification). Exact after
// normalizing, else the best window of the text's words by shared words, which tolerates OCR noise such as dropped
// periods; a window must share at least nine in ten words to count.

export type QuoteMatch = { status: "exact" | "fuzzy" | "not-found"; score: number }

const fuzzyThreshold = 0.9

function countWords(words: readonly string[]) {
  const counts = new Map<string, number>()
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return counts
}

/** Where a quote stands in a text: found exactly, found with OCR noise (with its score), or not found. */
export function matchQuote(quote: string, text: string): QuoteMatch {
  const normalizedQuote = normalizeForMatching(quote)
  const quoteWords = normalizedQuote.split(" ").filter(Boolean)
  if (quoteWords.length === 0) {
    return { status: "not-found", score: 0 }
  }
  const normalizedText = normalizeForMatching(text)
  if (` ${normalizedText} `.includes(` ${normalizedQuote} `)) {
    return { status: "exact", score: 1 }
  }
  const textWords = normalizedText.split(" ").filter(Boolean)
  const wanted = countWords(quoteWords)
  let best = 0
  for (const size of [quoteWords.length - 1, quoteWords.length, quoteWords.length + 1, quoteWords.length + 2]) {
    for (let start = 0; size > 0 && start + size <= textWords.length; start += 1) {
      const available = countWords(textWords.slice(start, start + size))
      let shared = 0
      for (const [word, count] of wanted) {
        shared += Math.min(count, available.get(word) ?? 0)
      }
      best = Math.max(best, shared / Math.max(quoteWords.length, size))
    }
  }
  const score = Math.round(best * 1000) / 1000
  return { status: score >= fuzzyThreshold ? "fuzzy" : "not-found", score }
}
