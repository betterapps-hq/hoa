import { levenshtein } from "@/text/match"

// The numbering grammar (encoding.md, Structure 2): articles, parts, exhibits, dotted sections and lettered or numbered
// points, read the way scans print them. OCR drops periods ("4 2", "42"), reads roman numerals as digits ("(111)",
// "(1v)") and loses parentheses ("e)"), so a marker is read into every interpretation it allows and the sequence it
// continues decides between them.

export type PointStyle = "lower" | "upper" | "roman" | "number"
export type PointReading = { style: PointStyle; ordinal: number }
export type PointMarker = { printed: string; readings: PointReading[]; rest: string }

const romanValues: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }

export function romanToInt(roman: string) {
  if (!/^[ivxlc]+$/.test(roman)) {
    return null
  }
  let total = 0
  for (let i = 0; i < roman.length; i += 1) {
    const value = romanValues[roman.charAt(i)] ?? 0
    const next = romanValues[roman.charAt(i + 1)] ?? 0
    total += value < next ? -value : value
  }
  return intToRoman(total) === roman ? total : null
}

export function intToRoman(value: number) {
  const steps: [number, string][] = [
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"]
  ]
  let rest = value
  let roman = ""
  for (const [step, numeral] of steps) {
    while (rest >= step) {
      roman += numeral
      rest -= step
    }
  }
  return roman
}

/** The normalized number for a reading: "b", "iv", "3", "C". */
export function renderPoint({ style, ordinal }: PointReading) {
  if (style === "roman") {
    return intToRoman(ordinal)
  }
  if (style === "number") {
    return String(ordinal)
  }
  const letter = String.fromCharCode(96 + ordinal)
  return style === "upper" ? letter.toUpperCase() : letter
}

/** Characters scans print for a roman i, v or x. */
function ocrRoman(raw: string) {
  return raw
    .replace(/[1lI|ıí!]/g, "i")
    .replace(/V/g, "v")
    .replace(/X/g, "x")
}

const pointPattern = /^\(?([A-Za-z0-9|ıí!]{1,6})\)\s*/

/** Every reading of a point marker at the start of a paragraph: "(a)", "a)", "(iv)", "(1V)", "(3)", "(B)". */
export function parsePointMarker(text: string): PointMarker | null {
  const found = pointPattern.exec(text)
  const raw = found?.[1]
  if (!found || !raw) {
    return null
  }
  const readings: PointReading[] = []
  if (/^\d+$/.test(raw)) {
    readings.push({ style: "number", ordinal: Number(raw) })
  }
  const asRoman = ocrRoman(raw)
  const roman = romanToInt(asRoman.toLowerCase())
  if (roman !== null && /^[ivx]+$/i.test(asRoman)) {
    readings.push({ style: "roman", ordinal: roman })
  }
  const asLetter = raw.replace(/[1|ıí!]/g, "i")
  if (/^[a-z]$/.test(asLetter)) {
    readings.push({ style: "lower", ordinal: asLetter.charCodeAt(0) - 96 })
  }
  if (/^[A-Z]$/.test(raw)) {
    readings.push({ style: "upper", ordinal: raw.charCodeAt(0) - 64 })
  }
  if (readings.length === 0) {
    return null
  }
  return { printed: `(${raw})`, readings, rest: text.slice(found[0].length).trim() }
}

const spelled = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen"
]

/** An article, part or exhibit number: digits, a roman numeral or a spelled-out word, as an integer. */
function headingNumber(printed: string) {
  if (/^\d+$/.test(printed)) {
    return Number(printed)
  }
  const word = spelled.indexOf(printed.toLowerCase())
  if (word >= 0) {
    return word + 1
  }
  return romanToInt(printed.toLowerCase())
}

export type HeadingMarker = { type: "article" | "part"; printed: string; number: number; rest: string }

const headingPattern = /^(article|part)\s+([0-9]+|[ivxlc]+|[a-z]+)\b[.:]?\s*/i

/** "ARTICLE 4 ARCHITECTURE", "Article IV", "PART ONE: INTRODUCTION". */
export function parseHeadingMarker(text: string): HeadingMarker | null {
  const found = headingPattern.exec(text)
  const kind = found?.[1]?.toLowerCase()
  const printed = found?.[2]
  if (!found || !printed || (kind !== "article" && kind !== "part")) {
    return null
  }
  const number = headingNumber(printed)
  return number === null ? null : { type: kind, printed, number, rest: text.slice(found[0].length).trim() }
}

export type ExhibitMarker = { printed: string; rest: string }

/** `EXHIBIT "C"`, `Exhibit A`, printed as a heading rather than a reference. */
export function parseExhibitMarker(text: string): ExhibitMarker | null {
  const found = /^EXHIBIT\s+["“”']?([A-Z0-9]{1,2})["“”']?(?=\s|$)\s*/i.exec(text)
  const printed = found?.[1]
  return found && printed ? { printed: printed.toUpperCase(), rest: text.slice(found[0].length).trim() } : null
}

export type SectionMarker = { printed: string; parts: number[]; rest: string }

const sectionPattern = /^(?:section\s+)?(\d{1,3}(?:(?:\s?[.-]\s?|\s)\d{1,3}){0,3})\.?(?=\s|$)\s*/i

/** A section number as printed, with the separators it shows: "4.3", "4 3", "43", "20-3", "Section 5.4.2". */
export function parseSectionMarker(text: string): SectionMarker | null {
  const found = sectionPattern.exec(text)
  const printed = found?.[1]
  if (!found || !printed) {
    return null
  }
  return {
    printed,
    parts: printed.split(/\s?[.-]\s?|\s/).map(Number),
    rest: text.slice(found[0].length).trim()
  }
}

/**
 * Reads a section marker as the next section of an article: "4.3", "4 3" and "43" in Article 4 are 4.3. A number whose
 * article part a scan dropped ("5.2" after 15.1) is repaired and marked inferred. `expected` is the next section number
 * within the article; a heading may skip up to two missing sections.
 */
export function readSection(marker: SectionMarker, article: number, expected: number, isHeading: boolean) {
  const articleText = String(article)
  const candidates: { section: number; isInferred: boolean }[] = []
  const [first, second] = marker.parts
  if (marker.parts.length === 2 && first !== undefined && second !== undefined) {
    if (first === article) {
      candidates.push({ section: second, isInferred: false })
    } else if (articleText.endsWith(String(first)) && articleText !== String(first)) {
      candidates.push({ section: second, isInferred: true })
    }
  }
  if (marker.parts.length === 1 && first !== undefined) {
    const digits = String(first)
    if (digits.startsWith(articleText) && digits.length > articleText.length) {
      candidates.push({ section: Number(digits.slice(articleText.length)), isInferred: false })
    }
  }
  const reach = isHeading ? 2 : 0
  return candidates.find(({ section }) => section >= expected && section <= expected + reach) ?? null
}

/** What a point marker does to the open lists, innermost first. */
export type PointDecision =
  | { action: "sibling"; depth: number; reading: PointReading; isInferred: boolean }
  | { action: "child"; reading: PointReading }
  | { action: "restart"; reading: PointReading }

export type OpenList = { style: PointStyle; last: number }

const isStart = (reading: PointReading) => reading.ordinal === 1

/** The style a list starting with an ambiguous "(1)" or "(i)" has, from the marker after it. */
function startStyle(marker: PointMarker, next: PointMarker | null, parent: OpenList | undefined) {
  const starts = marker.readings.filter(isStart)
  if (starts.length <= 1) {
    return starts[0]
  }
  const second = next?.readings.find((reading) => reading.ordinal === 2)
  const fromNext = second && starts.find((reading) => reading.style === second.style)
  if (fromNext) {
    return fromNext
  }
  // Lists nest letters, then roman numerals, then numbers.
  const preferred: PointStyle = parent?.style === "roman" ? "number" : "roman"
  return starts.find((reading) => reading.style === preferred) ?? starts[0]
}

/**
 * Decides what a point marker continues (encoding.md, Structure 2): a sibling in an open list, the start of a new list
 * under the current provision, or a restart under the paragraph just before it. A marker that breaks every sequence
 * is text (null). `next` is the next point marker in the document; `afterParagraph` says an unnumbered paragraph came
 * between the innermost list's last item and this marker.
 */
export function decidePoint(
  marker: PointMarker,
  open: readonly OpenList[],
  next: PointMarker | null,
  afterParagraph: boolean
): PointDecision | null {
  for (const [depth, list] of open.entries()) {
    const reading = marker.readings.find((r) => r.style === list.style && r.ordinal === list.last + 1)
    if (reading) {
      return { action: "sibling", depth, reading, isInferred: false }
    }
  }
  const innermost = open[0]
  const start = startStyle(marker, next, innermost)
  const startsNextList =
    start !== undefined && next?.readings.some((r) => r.style === start.style && r.ordinal === 2) === true
  if (innermost && start && afterParagraph && start.style === innermost.style && startsNextList) {
    return { action: "restart", reading: start }
  }
  if (innermost?.style === "roman" && !startsNextList) {
    const expected = intToRoman(innermost.last + 1)
    const isClose = marker.readings.some(
      (r) => r.style === "roman" && levenshtein(intToRoman(r.ordinal), expected) <= 1
    )
    if (isClose) {
      return { action: "sibling", depth: 0, reading: { style: "roman", ordinal: innermost.last + 1 }, isInferred: true }
    }
  }
  return start ? { action: "child", reading: start } : null
}

/** Whether a line is only a marker, which never counts as page furniture: "(a)", "42", "6.3". */
export function isMarkerOnly(line: string) {
  const text = line.trim()
  const point = parsePointMarker(text)
  if (point) {
    return point.rest === ""
  }
  return !/^section\b/i.test(text) && parseSectionMarker(text)?.rest === ""
}
