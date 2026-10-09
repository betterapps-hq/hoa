import type { IsoDate } from "@/schema/types"

// Dates as applications write them (application-review.md, Recognition), in US month-day order: "09/04/26",
// "9-4-2026", "2026-09-04", "September 4, 2026", "Sept. 4", "4 September 2026". A fast check on the model's reading of
// a date, never a gate; a date without a year takes the reference date's year.

const months: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
}

const monthNames = Object.keys(months)
  .toSorted((a, b) => b.length - a.length)
  .join("|")

const patterns: { pattern: RegExp; read: (match: RegExpExecArray, year: number) => [number, number, number] }[] = [
  {
    pattern: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
    read: (match) => [Number(match[1]), Number(match[2]), Number(match[3])]
  },
  {
    pattern: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g,
    read: (match) => [fullYear(match[3] ?? ""), Number(match[1]), Number(match[2])]
  },
  {
    pattern: new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"),
    read: (match, year) => [match[3] ? Number(match[3]) : year, monthOf(match[1]), Number(match[2])]
  },
  {
    pattern: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?,?(?:\\s+(\\d{4}))?\\b`, "gi"),
    read: (match, year) => [match[3] ? Number(match[3]) : year, monthOf(match[2]), Number(match[1])]
  },
  {
    pattern: /\b(\d{1,2})\/(\d{1,2})\b/g,
    read: (match, year) => [year, Number(match[1]), Number(match[2])]
  }
]

/** The month a name or abbreviation names ("Sept", "september"), or 0. */
export function monthOf(name: string | undefined) {
  return months[(name ?? "").toLowerCase()] ?? 0
}

function fullYear(digits: string) {
  return digits.length === 4 ? Number(digits) : 2000 + Number(digits)
}

function isoOf(year: number, month: number, day: number): IsoDate | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

/**
 * The calendar date a text states. The first form that matches decides; null when no form matches, the date doesn't
 * exist, or the text states two different dates in that form.
 */
export function parseDate(text: string, referenceDate: IsoDate): IsoDate | null {
  const year = Number(referenceDate.slice(0, 4))
  for (const { pattern, read } of patterns) {
    const found = new Set(
      [...text.matchAll(pattern)].map((match) => {
        const [y, m, d] = read(match, year)
        return isoOf(y, m, d)
      })
    )
    if (found.size > 0) {
      const [only] = found
      return found.size === 1 && only ? only : null
    }
  }
  return null
}
