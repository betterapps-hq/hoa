import { match } from "ts-pattern"
import { z } from "zod"
import { cleanPages } from "@/encoding/clean"
import { analyzeReferences, citedProvisions } from "@/encoding/references"
import type { Page } from "@/ocr/page"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import { pluralOf } from "@/text/normalize"
import type { RulebookRecords } from "./assemble"
import { isLive } from "./review"

// Coverage (schema.md, Sources, Coverage; encoding.md, UX, Coverage): what covers each provision, the build's report,
// and the coverage report the rules UX draws: each document's text in order, every passage by what covers it, the page
// text no provision holds, the values the rules encode marked where the text states them, and the share of characters
// each kind covers per document and article.

/** The build's coverage report (encoding.md, Merge): how many provisions it read, and the keys of those nothing covers. */
export const rulebookCoverage = z.object({
  provisions: z.number().int().nonnegative(),
  uncovered: z.array(z.string())
})
export type RulebookCoverage = z.infer<typeof rulebookCoverage>

export type ClauseName = keyof T.Settings["clauses"]

export type ProvisionCoverage = { rules: T.RuleKey[]; terms: T.TermKey[]; clauses: ClauseName[]; questions: T.Id[] }

/** The provision keys a record cites, wherever its citations are. */
function citedKeys(record: unknown) {
  const keys = new Set<T.ProvisionKey>()
  JSON.stringify(record, (key, value: unknown) => {
    if (key === "provisionKey" && typeof value === "string") {
      keys.add(value)
    }
    return value
  })
  return keys
}

export const isCited = (coverage: ProvisionCoverage | undefined) =>
  coverage !== undefined &&
  (coverage.rules.length > 0 ||
    coverage.terms.length > 0 ||
    coverage.clauses.length > 0 ||
    coverage.questions.length > 0)

/**
 * What covers each provision: the records citing it that aren't rejected. A provision nothing cites and with no no-rule
 * reason is uncovered.
 */
export function coverageOf(
  records: Pick<RulebookRecords, "provisions" | "rules" | "terms" | "settings" | "questions">
) {
  const byProvision = new Map<T.ProvisionKey, ProvisionCoverage>(
    records.provisions.map((provision) => [provision.key, { rules: [], terms: [], clauses: [], questions: [] }])
  )
  const cite = (record: unknown, add: (coverage: ProvisionCoverage) => void) => {
    for (const key of citedKeys(record)) {
      const coverage = byProvision.get(key)
      if (coverage) {
        add(coverage)
      }
    }
  }
  for (const rule of records.rules.filter(isLive)) {
    cite(rule, (coverage) => coverage.rules.push(rule.key))
  }
  for (const term of records.terms.filter(isLive)) {
    cite(term, (coverage) => coverage.terms.push(term.key))
  }
  const { clauses } = records.settings
  const isClauseName = (key: string): key is ClauseName => Object.hasOwn(clauses, key)
  for (const name of Object.keys(clauses).filter(isClauseName)) {
    cite(clauses[name], (coverage) => coverage.clauses.push(name))
  }
  for (const question of records.questions) {
    cite(question.citations, (coverage) => coverage.questions.push(question.id))
  }
  const uncovered = records.provisions
    .filter((provision) => provision.noRule === null && !isCited(byProvision.get(provision.key)))
    .map((provision) => provision.key)
  return { byProvision, uncovered }
}

export type Coverage = ReturnType<typeof coverageOf>

// ─── Kinds ──────────────────────────────────────────────────────────────────────────────────────

/**
 * What a passage of text is covered by, in the order a coverage bar stacks them: a rule (or a question deciding
 * between rules), a term's definition, a settings clause, an approved no-rule reason, a reason still to review, nothing
 * (an uncovered provision), or no provision at all (page text the structure stage didn't place in one).
 */
export const coverageKinds = ["rule", "term", "settings", "reason", "to-review", "outside", "uncovered"] as const
export type CoverageKind = (typeof coverageKinds)[number]

/** The kinds that count as covered. */
export const coveredKinds: ReadonlySet<CoverageKind> = new Set(["rule", "term", "settings", "reason"])

/** A provision's kind: the strongest record citing it, else its reason, else uncovered. */
export function coverageKindOf(provision: T.Provision, coverage: ProvisionCoverage | undefined): CoverageKind {
  if (coverage && (coverage.rules.length > 0 || coverage.questions.length > 0)) {
    return "rule"
  }
  if (coverage && coverage.terms.length > 0) {
    return "term"
  }
  if (coverage && coverage.clauses.length > 0) {
    return "settings"
  }
  if (provision.noRule) {
    return provision.noRule.review.status === "approved" ? "reason" : "to-review"
  }
  return "uncovered"
}

export type CoverageTotals = Record<CoverageKind, number>

const emptyTotals = (): CoverageTotals => ({
  rule: 0,
  term: 0,
  settings: 0,
  reason: 0,
  "to-review": 0,
  outside: 0,
  uncovered: 0
})

function addTotals(into: CoverageTotals, from: CoverageTotals) {
  for (const kind of coverageKinds) {
    into[kind] += from[kind]
  }
}

export const totalOf = (totals: CoverageTotals) => coverageKinds.reduce((sum, kind) => sum + totals[kind], 0)

/** The covered share of the characters, 0 to 1; 1 when there are none. */
export function coveredShare(totals: CoverageTotals) {
  const total = totalOf(totals)
  const covered = coverageKinds.filter((kind) => coveredKinds.has(kind)).reduce((sum, kind) => sum + totals[kind], 0)
  return total === 0 ? 1 : covered / total
}

// ─── Text outside any provision ─────────────────────────────────────────────────────────────────

/** Page text the structure stage read but placed in no provision: offsets are into the page record's text. */
export type OutsidePassage = { fileId: string; page: number; start: number; end: number; text: string }

/** One upload's text outside its provisions, and the pages cleaning skipped as front matter. */
export type SourceText = { fileId: string; skippedPages: number[]; outside: OutsidePassage[] }

// A word or a number, not a stray letter a scan left (a watermark fragment, a lost bullet).
const hasContent = (text: string) => /[\p{L}\p{N}]{2,}/u.test(text)

/**
 * The text of an upload's pages that no provision's anchors hold (encoding.md, Structure 5): cleaned as the structure
 * stage cleans it, so page headers, footers, numbers, stamps and front matter aren't counted, then every run outside
 * the anchors. Consecutive runs join into one passage.
 */
export function textOutsideProvisions(
  fileId: string,
  pages: readonly Page[],
  provisions: readonly Pick<T.Provision, "anchors">[]
): SourceText {
  const clean = cleanPages(pages)
  const textOf = new Map(pages.map((page) => [page.pageIndex, page.text]))
  const anchored = Map.groupBy(
    provisions.flatMap((provision) => provision.anchors.filter((anchor) => anchor.fileId === fileId)),
    (anchor) => anchor.page
  )
  const outside: OutsidePassage[] = []
  let open: OutsidePassage | null = null
  const close = () => {
    if (open && hasContent(open.text)) {
      // Lines of a paragraph join with a space; a blank line between them stays a paragraph break.
      const text = open.text
        .trim()
        .replaceAll(/[ \t]*\n[ \t]*/g, "\n")
        .replaceAll(/\n{2,}/g, "\n\n")
        .replaceAll(/(?<!\n)\n(?!\n)/g, " ")
      outside.push({ ...open, text })
    }
    open = null
  }
  for (const line of clean.lines) {
    if (line.pieces.length === 0 && line.text === "" && open) {
      open.text += "\n"
    }
    for (const piece of line.pieces) {
      const covering = (anchored.get(piece.page) ?? []).toSorted((a, b) => a.start - b.start)
      let at = piece.start
      for (const anchor of covering) {
        if (anchor.end <= at || anchor.start >= piece.end) {
          continue
        }
        if (anchor.start > at) {
          open = extend(open, fileId, piece.page, at, anchor.start, textOf.get(piece.page) ?? "")
        }
        close()
        at = Math.max(at, anchor.end)
      }
      if (at < piece.end) {
        open = extend(open, fileId, piece.page, at, piece.end, textOf.get(piece.page) ?? "")
      }
    }
    if (open) {
      open.text += "\n"
    }
  }
  close()
  return { fileId, skippedPages: clean.droppedPages, outside }
}

function extend(
  open: OutsidePassage | null,
  fileId: string,
  page: number,
  start: number,
  end: number,
  pageText: string
): OutsidePassage {
  const text = pageText.slice(start, end)
  if (!open) {
    return { fileId, page, start, end, text }
  }
  // A passage running onto the next page keeps where it starts.
  const joined = `${open.text}${open.text.endsWith("\n") ? "" : " "}${text}`
  return { ...open, end: open.page === page ? end : open.end, text: joined }
}

// ─── Values the rules encode ────────────────────────────────────────────────────────────────────

/** A constant a rule compares against or counts with: an amount, a number, a fraction, a date or a time. */
export type EncodedValue =
  | { type: "amount"; value: number; unit: T.TermKey }
  | { type: "number"; value: number }
  | { type: "fraction"; numerator: number; denominator: number }
  | { type: "date"; value: T.IsoDate }
  | { type: "month-day"; value: T.MonthDay }
  | { type: "time"; value: T.TimeOfDay }

const bookkeeping = new Set(["provenance", "review", "issues", "citations", "statement", "title"])
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

/** Every constant a rule holds, once each. */
export function encodedValuesOf(rule: T.Rule): EncodedValue[] {
  const found = new Map<string, EncodedValue>()
  const add = (value: EncodedValue) => found.set(JSON.stringify(value), value)
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isRecord(node)) {
      return
    }
    const { type, value, unit } = node
    if (typeof value === "number" && typeof unit === "string" && (type === undefined || type === "quantity")) {
      add({ type: "amount", value, unit })
    } else if (type === "number" && typeof value === "number") {
      add({ type: "number", value })
    } else if (type === "date" && typeof value === "string") {
      add({ type: "date", value })
    } else if (type === "time" && typeof value === "string") {
      add({ type: "time", value })
    } else if (type === "fraction" && typeof node.numerator === "number" && typeof node.denominator === "number") {
      add({ type: "fraction", numerator: node.numerator, denominator: node.denominator })
    }
    for (const [key, item] of Object.entries(node)) {
      if (bookkeeping.has(key)) {
        continue
      }
      if ((key === "from" || key === "to" || key === "at") && typeof item === "string") {
        if (/^\d{2}:\d{2}$/.test(item)) {
          add({ type: "time", value: item })
        } else if (/^\d{2}-\d{2}$/.test(item)) {
          add({ type: "month-day", value: item })
        }
      }
      visit(item)
    }
  }
  visit(rule)
  return [...found.values()]
}

const ones = [
  "zero",
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
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen"
]
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
const ordinals = ["", "", "half", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const anyOf = (forms: string[]) =>
  `(?:${[...new Set(forms)]
    .toSorted((a, b) => b.length - a.length)
    .map(escape)
    .join("|")})`

/** "seventy-two" for 72: whole numbers up to one hundred in words; null beyond. */
function numberWords(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return null
  }
  if (value === 100) {
    return "one hundred"
  }
  if (value < 20) {
    return ones[value] ?? null
  }
  const rest = value % 10
  const ten = tens[Math.floor(value / 10)] ?? ""
  return rest === 0 ? ten : `${ten}[- ]${ones[rest] ?? ""}`
}

/** A number as the text may write it: "30", "1,000", "30.00", "thirty", "thirty (30)". */
function numberPattern(value: number) {
  const numerals = [String(value), value.toLocaleString("en-US")].map(escape)
  const numeral = `(?<![\\w.,])(?:${[...new Set(numerals)].join("|")})${Number.isInteger(value) ? "(?:\\.0+)?" : ""}(?![\\w]|[.,]\\d)`
  const words = numberWords(value)
  return words ? `(?:\\b${words}\\b\\s*\\(\\s*${numeral}\\s*\\)|${numeral}|\\b${words}\\b)` : numeral
}

const isCurrency = (label: string) => /^\p{Sc}$/u.test(label)

function unitForms(unit: T.TermKey, vocabulary: Vocabulary) {
  const labels = vocabulary.get(unit)?.labels ?? []
  const forms = labels.flatMap((label) => [label.text, label.plural ?? pluralOf(label.text)])
  return {
    prefixes: forms.filter(isCurrency),
    // "calendar days" reads "calendar day" after "one"; a symbol or a short label ("in", "ft") stays as it is.
    suffixes: forms.flatMap((form) =>
      isCurrency(form) ? [] : [form, form.endsWith("s") && form.length > 3 ? form.slice(0, -1) : form]
    )
  }
}

function amountPatterns(value: number, unit: T.TermKey, vocabulary: Vocabulary) {
  const { prefixes, suffixes } = unitForms(unit, vocabulary)
  const number = numberPattern(value)
  const after = /\w$/u
  return [
    ...(prefixes.length > 0 ? [`${anyOf(prefixes)}\\s?${number}`] : []),
    ...(suffixes.length > 0
      ? [`${number}\\s*-?\\s*${anyOf(suffixes)}${suffixes.some((form) => after.test(form)) ? "(?![\\p{L}])" : ""}`]
      : [])
  ]
}

function datePatterns(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  const name = months[(month ?? 0) - 1]
  if (!year || !day || !name) {
    return [escape(iso)]
  }
  return [
    escape(iso),
    `\\b${name}\\.?\\s+${day}(?:st|nd|rd|th)?,?\\s+${year}\\b`,
    `\\b${name.slice(0, 3)}\\.?\\s+${day}(?:st|nd|rd|th)?,?\\s+${year}\\b`,
    `(?<!\\d)0?${month}/0?${day}/${year}\\b`,
    `\\b${day}(?:st|nd|rd|th)? day of ${name},?\\s+${year}\\b`
  ]
}

function monthDayPatterns(monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number)
  const name = months[(month ?? 0) - 1]
  return name && day
    ? [`\\b${name}\\s+${day}(?:st|nd|rd|th)?(?!\\d)`, `\\b${day}(?:st|nd|rd|th)? (?:day )?of ${name}\\b`]
    : []
}

function timePatterns(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  const hour = hours % 12 === 0 ? 12 : hours % 12
  const meridiem = hours < 12 ? "a" : "p"
  const clock = minutes === 0 ? `${hour}(?::00)?` : `${hour}:${String(minutes).padStart(2, "0")}`
  return [
    `(?<![\\d:])${clock}\\s*${meridiem}\\.?\\s?m\\b\\.?`,
    `(?<![\\d:])${escape(time)}(?!\\d)`,
    ...(hours === 12 && minutes === 0 ? ["\\bnoon\\b"] : []),
    ...(hours === 0 && minutes === 0 ? ["\\bmidnight\\b"] : [])
  ]
}

function fractionPatterns(numerator: number, denominator: number) {
  const top = numberWords(numerator)
  const bottom = ordinals[denominator]
  const plural = bottom === "half" ? "halves" : `${bottom}s`
  return [
    `(?<![\\d/])${numerator}/${denominator}(?![\\d/])`,
    ...(top && bottom ? [`\\b${top}[- ](?:${bottom}|${plural})\\b`] : []),
    ...(numerator === 1 && denominator === 2 ? ["\\bone half\\b", "\\bhalf\\b"] : [])
  ]
}

const patternsOf = (value: EncodedValue, vocabulary: Vocabulary) =>
  match(value)
    .with({ type: "amount" }, ({ value: amount, unit }) => amountPatterns(amount, unit, vocabulary))
    // A bare one or zero is too common a word to mark as a value.
    .with({ type: "number" }, ({ value: number }) => (number === 0 || number === 1 ? [] : [numberPattern(number)]))
    .with({ type: "fraction" }, ({ numerator, denominator }) => fractionPatterns(numerator, denominator))
    .with({ type: "date" }, ({ value: date }) => datePatterns(date))
    .with({ type: "month-day" }, ({ value: monthDay }) => monthDayPatterns(monthDay))
    .with({ type: "time" }, ({ value: time }) => timePatterns(time))
    .exhaustive()

export type ValueMark = { start: number; end: number; value: EncodedValue }

/**
 * Where a text states the values a rule encodes, from the rule's own constants: an amount with its unit ("six (6)
 * feet", "$50"), a number, a fraction, a date or a time. Overlapping marks keep the earliest, then the longest.
 */
export function valueMarks(text: string, values: readonly EncodedValue[], vocabulary: Vocabulary): ValueMark[] {
  const marks = values.flatMap((value) =>
    patternsOf(value, vocabulary).flatMap((pattern) =>
      [...text.matchAll(new RegExp(pattern, "giu"))].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        value
      }))
    )
  )
  const kept: ValueMark[] = []
  for (const mark of marks.toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    const last = kept.at(-1)
    if (!last || mark.start >= last.end) {
      kept.push(mark)
    }
  }
  return kept
}

// ─── The report ─────────────────────────────────────────────────────────────────────────────────

/**
 * One passage of a document in reading order: a provision's own words (its heading, text and intro), its wrap-up
 * after its children, or page text outside any provision.
 */
export type CoveragePassage =
  | {
      type: "provision"
      key: string
      provision: T.Provision
      part: "main" | "wrap-up"
      text: string
      kind: CoverageKind
      depth: number
      marks: ValueMark[]
    }
  | { type: "outside"; key: string; passage: OutsidePassage; text: string; kind: "outside"; depth: number }

/** A top-level provision (an article, a part, an exhibit) with everything under it. */
export type ArticleCoverage = { provision: T.Provision; totals: CoverageTotals; passages: CoveragePassage[] }

export type DocumentCoverage = {
  key: string
  title: string
  totals: CoverageTotals
  articles: ArticleCoverage[]
  /** Pages cleaning skipped as front matter, per upload the document's provisions point into. */
  skippedPages: { fileId: string; pages: number[] }[]
}

export type CoverageReport = {
  totals: CoverageTotals
  documents: DocumentCoverage[]
  /** The provisions whose text cites each provision, in reading order. */
  referencedBy: Map<T.ProvisionKey, T.ProvisionKey[]>
}

const documentKeyOf = (provisionKey: T.ProvisionKey) => provisionKey.slice(0, provisionKey.indexOf(":"))

/** A provision's own words in reading order, before its children. */
const mainText = (provision: T.Provision) =>
  [provision.heading, provision.text, provision.intro].filter((part) => part !== null && part !== "").join("\n")

function comesBefore(a: { page: number; start: number }, b: { page: number; start: number }) {
  return a.page < b.page || (a.page === b.page && a.start <= b.start)
}

/** "Use Restrictions" for `use-restrictions`: a document's name as its text writes it. */
const nameOf = (documentKey: string) =>
  documentKey
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

/**
 * The provisions whose text cites each provision ("Section 3.1(a)", "this Article", "subsection (b) above"), found with
 * the grammar the build's reference analysis uses (encoding.md, References and analysis).
 */
export function referencesTo(provisions: readonly T.Provision[]) {
  const documents = [...Map.groupBy(provisions, (provision) => documentKeyOf(provision.key))].map(([key, items]) => ({
    key,
    provisions: items
  }))
  const known = documents.map(({ key }) => ({ key, names: [nameOf(key)] }))
  const referencedBy = new Map<T.ProvisionKey, T.ProvisionKey[]>()
  for (const [from, found] of analyzeReferences(documents, known).references) {
    for (const key of citedProvisions(found, from)) {
      referencedBy.set(key, [...(referencedBy.get(key) ?? []), from])
    }
  }
  return referencedBy
}

type Position = { fileId: string; page: number; start: number }

/** Where a provision starts on its pages: its first anchor, or its earliest child's when it has none (a part's heading). */
function positionOf(provision: T.Provision, children: Map<string | null, T.Provision[]>, depth = 0): Position | null {
  const [anchor] = provision.anchors
  if (anchor) {
    return anchor
  }
  // Labels are unique within a document; the cap only stops a cycle an unvalidated draft might hold.
  const found =
    depth < 20 ? (children.get(provision.label) ?? []).map((child) => positionOf(child, children, depth + 1)) : []
  return found.reduce<Position | null>(
    (first, position) => (position && (!first || comesBefore(position, first)) ? position : first),
    null
  )
}

/**
 * Siblings in the order their pages hold them when they were all read from one upload, whatever order storage gives
 * them; otherwise in their stored order.
 */
function inPageOrder(siblings: readonly T.Provision[], children: Map<string | null, T.Provision[]>) {
  const positions = new Map(siblings.map((provision) => [provision, positionOf(provision, children)]))
  const [first] = positions.values()
  const isPlaced = [...positions.values()].every((position) => position && position.fileId === first?.fileId)
  return isPlaced
    ? siblings.toSorted((a, b) => {
        const [x, y] = [positions.get(a), positions.get(b)]
        return x && y ? x.page - y.page || x.start - y.start : 0
      })
    : siblings
}

/**
 * A document's provisions parent before children, siblings in reading order: the order they're read in, whatever
 * order storage gives them. A provision whose parent isn't there starts a branch of its own.
 */
function inReadingOrder(provisions: readonly T.Provision[]) {
  const labels = new Set(provisions.map((provision) => provision.label))
  const children = Map.groupBy(provisions, (provision) =>
    provision.parentLabel !== null && labels.has(provision.parentLabel) ? provision.parentLabel : null
  )
  const ordered: T.Provision[] = []
  const visit = (parent: string | null, depth: number) => {
    for (const provision of inPageOrder(children.get(parent) ?? [], children)) {
      ordered.push(provision)
      // Labels are unique within a document; the cap only stops a cycle an unvalidated draft might hold.
      if (depth < 20) {
        visit(provision.label, depth + 1)
      }
    }
  }
  visit(null, 0)
  return ordered
}

/**
 * Places each outside passage after the provision whose first anchor comes last before it in its upload, or at the
 * start of the first anchored provision's document when none does. Provisions are taken in page order.
 */
export function placeOutside(provisions: readonly T.Provision[], sourceText: readonly SourceText[]) {
  const after = new Map<T.ProvisionKey, OutsidePassage[]>()
  for (const source of sourceText) {
    // In page order, whatever order storage gives the provisions.
    const anchored = provisions
      .flatMap((provision) => {
        const anchor = provision.anchors.find((item) => item.fileId === source.fileId)
        return anchor ? [{ provision, anchor }] : []
      })
      .toSorted((a, b) => a.anchor.page - b.anchor.page || a.anchor.start - b.anchor.start)
    const first = anchored[0]
    if (!first) {
      continue
    }
    for (const passage of source.outside) {
      const before = anchored.findLast(({ anchor }) => comesBefore(anchor, passage))
      // The start of a document is keyed by its first provision with a "^" so it comes before the provision's text.
      const key = before ? before.provision.key : `^${first.provision.key}`
      after.set(key, [...(after.get(key) ?? []), passage])
    }
  }
  return after
}

/**
 * One passage of a document in reading order, before anything covers it: a provision's own words (its heading, text
 * and intro), its wrap-up after its children, or page text outside any provision. Depth is how many ancestors it has.
 */
export type ReadingPassage =
  | { type: "provision"; key: string; provision: T.Provision; part: "main" | "wrap-up"; depth: number }
  | { type: "outside"; key: string; passage: OutsidePassage; depth: number }

/**
 * A document's text in reading order, grouped by top-level provision (an article, a part, an exhibit): each provision
 * before its children and its wrap-up after them, with the page text outside any provision where `placeOutside` put it
 * (placed over every document's provisions, since one upload can hold several documents).
 */
export function readingOrder(
  provisions: readonly T.Provision[],
  outsideAfter: ReadonlyMap<string, readonly OutsidePassage[]> = new Map()
): { article: T.Provision; passages: ReadingPassage[] }[] {
  const ordered = inReadingOrder(provisions)
  const articles: { article: T.Provision; passages: ReadingPassage[] }[] = []
  const stack: T.Provision[] = []
  const push = (passage: ReadingPassage) => articles.at(-1)?.passages.push(passage)
  const outside = (key: string, depth: number) => {
    for (const passage of outsideAfter.get(key) ?? []) {
      push({ type: "outside", key: `outside:${passage.fileId}:${passage.page}:${passage.start}`, passage, depth })
    }
  }
  const close = () => {
    const done = stack.pop()
    if (done?.wrapUp) {
      push({ type: "provision", key: `${done.key}/wrap-up`, provision: done, part: "wrap-up", depth: stack.length })
    }
  }
  for (const provision of ordered) {
    while (stack.length > 0 && stack.at(-1)?.label !== provision.parentLabel) {
      close()
    }
    if (stack.length === 0) {
      articles.push({ article: provision, passages: [] })
    }
    outside(`^${provision.key}`, stack.length)
    push({ type: "provision", key: provision.key, provision, part: "main", depth: stack.length })
    stack.push(provision)
    outside(provision.key, stack.length)
  }
  while (stack.length > 0) {
    close()
  }
  return articles
}

/**
 * The coverage report: every document with provisions, its text in reading order passage by passage, each covered
 * (or not) by a kind, with the characters each kind covers per article, document and in all. Values the rules citing a
 * provision encode are marked in its text.
 */
export function coverageReport(
  records: Pick<RulebookRecords, "documents" | "provisions" | "rules">,
  coverage: Coverage,
  vocabulary: Vocabulary,
  sourceText: readonly SourceText[] = []
): CoverageReport {
  const outsideAfter = placeOutside(records.provisions, sourceText)
  const rulesByKey = new Map(records.rules.map((rule) => [rule.key, rule]))
  const marksOf = (provision: T.Provision, text: string) => {
    const values = (coverage.byProvision.get(provision.key)?.rules ?? []).flatMap((key) => {
      const rule = rulesByKey.get(key)
      return rule ? encodedValuesOf(rule) : []
    })
    return values.length > 0 ? valueMarks(text, values, vocabulary) : []
  }
  const byDocument = Map.groupBy(records.provisions, (provision) => documentKeyOf(provision.key))
  const documents = records.documents.flatMap((document): DocumentCoverage[] => {
    const provisions = byDocument.get(document.key) ?? []
    if (provisions.length === 0) {
      return []
    }
    const covered = (passage: ReadingPassage): CoveragePassage => {
      if (passage.type === "outside") {
        return { ...passage, text: passage.passage.text, kind: "outside" }
      }
      const text = passage.part === "main" ? mainText(passage.provision) : (passage.provision.wrapUp ?? "")
      return {
        ...passage,
        text,
        kind: coverageKindOf(passage.provision, coverage.byProvision.get(passage.provision.key)),
        marks: marksOf(passage.provision, text)
      }
    }
    const articles = readingOrder(provisions, outsideAfter).map(({ article, passages }): ArticleCoverage => {
      const totals = emptyTotals()
      const shown = passages.map(covered)
      for (const passage of shown) {
        totals[passage.kind] += passage.text.length
      }
      return { provision: article, totals, passages: shown }
    })
    const totals = emptyTotals()
    for (const article of articles) {
      addTotals(totals, article.totals)
    }
    const fileIds = new Set(provisions.flatMap((provision) => provision.anchors.map((anchor) => anchor.fileId)))
    return [
      {
        key: document.key,
        title: document.title,
        totals,
        articles,
        skippedPages: sourceText
          .filter((source) => fileIds.has(source.fileId) && source.skippedPages.length > 0)
          .map((source) => ({ fileId: source.fileId, pages: source.skippedPages }))
      }
    ]
  })
  const totals = emptyTotals()
  for (const document of documents) {
    addTotals(totals, document.totals)
  }
  return { totals, documents, referencedBy: referencesTo(records.provisions) }
}
