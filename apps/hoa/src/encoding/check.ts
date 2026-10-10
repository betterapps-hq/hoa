import type { Provision } from "@/schema/types"
import type { CleanDocument } from "./clean"
import { romanToInt } from "./numbering"
import type { StructuredDocument } from "./provisions"

// Check (encoding.md, Structure 5): how much of the cleaned text the provisions cover, whether every numbered sequence
// runs without gaps, whether keys are unique, and whether the provisions are a plausible size and depth. A document with
// more than 2 percent of its text outside any provision, a broken sequence, a repeated key, a provision too long to be
// one (the parser missed the numbering under it) or nesting too deep to be real goes to hoa-structure-repair; inferred
// numbers only need confirming.

export const structureProblemCodes = [
  "uncovered-text",
  "broken-sequence",
  "duplicate-key",
  "oversized-provision",
  "deep-nesting",
  "inferred-number"
] as const

export type StructureProblem = {
  code: (typeof structureProblemCodes)[number]
  message: string
  key: string | null
}

export type StructureCheck = {
  /** The share of the cleaned text outside every provision, from 0 to 1. */
  outside: number
  problems: StructureProblem[]
  needsRepair: boolean
}

const maxOutside = 0.02
/** Longer than any provision governing documents print (the longest seen across ten organizations' is about 700). */
const maxWords = 1000
/** Deeper than any outline governing documents print: article, section, subsection, and three list levels. */
const maxDepth = 6

const wordsOf = (provision: Provision) =>
  [provision.text, provision.intro, provision.wrapUp].filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length

function sizeProblems(document: StructuredDocument) {
  const byLabel = new Map(document.provisions.map((provision) => [provision.label, provision]))
  const depthOf = (provision: Provision) => {
    let depth = 1
    for (
      let label = provision.parentLabel;
      label !== null && depth <= maxDepth;
      label = byLabel.get(label)?.parentLabel ?? null
    ) {
      depth += 1
    }
    return depth
  }
  return document.provisions.flatMap((provision): StructureProblem[] => {
    const words = wordsOf(provision)
    if (words > maxWords) {
      const message = `${provision.key} holds ${words} words, more than one provision does`
      return [{ code: "oversized-provision", message, key: provision.key }]
    }
    if (depthOf(provision) > maxDepth) {
      const message = `${provision.key} is nested more than ${maxDepth} levels deep`
      return [{ code: "deep-nesting", message, key: provision.key }]
    }
    return []
  })
}

type Range = { start: number; end: number }

function coveredLength(range: Range, covered: readonly Range[]) {
  let length = 0
  for (const span of covered) {
    length += Math.max(0, Math.min(range.end, span.end) - Math.max(range.start, span.start))
  }
  return Math.min(length, range.end - range.start)
}

function merge(ranges: Range[]) {
  const merged: Range[] = []
  for (const range of ranges.toSorted((a, b) => a.start - b.start)) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function outsideShare(clean: CleanDocument, provisions: readonly Provision[]) {
  const byPage = new Map<number, Range[]>()
  for (const anchor of provisions.flatMap((provision) => provision.anchors)) {
    byPage.set(anchor.page, [...(byPage.get(anchor.page) ?? []), { start: anchor.start, end: anchor.end }])
  }
  const covered = new Map([...byPage].map(([page, ranges]) => [page, merge(ranges)]))
  let total = 0
  let inside = 0
  for (const piece of clean.lines.flatMap((line) => line.pieces)) {
    total += piece.end - piece.start
    inside += coveredLength(piece, covered.get(piece.page) ?? [])
  }
  return total === 0 ? 0 : 1 - inside / total
}

/** The value of a point's number in each style it can be read in. */
function readings(normalized: string) {
  const values: { style: string; value: number }[] = []
  if (/^\d+$/.test(normalized)) {
    values.push({ style: "number", value: Number(normalized) })
  }
  const roman = romanToInt(normalized)
  if (roman !== null) {
    values.push({ style: "roman", value: roman })
  }
  if (/^[a-z]$/.test(normalized)) {
    values.push({ style: "lower", value: normalized.charCodeAt(0) - 96 })
  }
  if (/^[A-Z]$/.test(normalized)) {
    values.push({ style: "upper", value: normalized.charCodeAt(0) - 64 })
  }
  return values
}

/** Whether numbers run in lists that each start at one and go up by one: a, b, c, then i, ii under another parent. */
function isSequence(numbers: readonly string[]) {
  let current: { style: string; value: number } | null = null
  for (const number of numbers) {
    const options = readings(number)
    const next: { style: string; value: number } | undefined =
      options.find((option) => option.style === current?.style && option.value === current.value + 1) ??
      options.find((option) => option.value === 1)
    if (!next) {
      return false
    }
    current = next
  }
  return true
}

function sequenceProblems(document: StructuredDocument) {
  const problems: StructureProblem[] = []
  const children = new Map<string | null, Provision[]>()
  for (const provision of document.provisions) {
    children.set(provision.parentLabel, [...(children.get(provision.parentLabel) ?? []), provision])
  }
  for (const [parent, items] of children) {
    const numbered = (kind: Provision["kind"]) =>
      items.filter((item) => item.kind === kind).map((item) => item.num?.normalized.split(".").at(-1) ?? "")
    for (const kind of ["article", "section", "point"] as const) {
      if (!isSequence(numbered(kind))) {
        const where = parent === null ? document.key : `${document.key}:${parent}`
        problems.push({ code: "broken-sequence", message: `the ${kind}s under ${where} skip a number`, key: where })
      }
    }
  }
  return problems
}

export function checkStructure(clean: CleanDocument, documents: readonly StructuredDocument[]): StructureCheck {
  const provisions = documents.flatMap((document) => document.provisions)
  const outside = outsideShare(clean, provisions)
  const problems: StructureProblem[] = []
  if (outside > maxOutside) {
    const percent = (outside * 100).toFixed(1)
    problems.push({ code: "uncovered-text", message: `${percent}% of the text is outside every provision`, key: null })
  }
  problems.push(...documents.flatMap(sequenceProblems), ...documents.flatMap(sizeProblems))
  const seen = new Set<string>()
  for (const provision of provisions) {
    if (seen.has(provision.key)) {
      problems.push({ code: "duplicate-key", message: `${provision.key} appears twice`, key: provision.key })
    }
    seen.add(provision.key)
    if (provision.num?.source === "inferred") {
      const message = `${provision.key}'s number was repaired from "${provision.num.printed ?? ""}"`
      problems.push({ code: "inferred-number", message, key: provision.key })
    }
  }
  return { outside, problems, needsRepair: problems.some((problem) => problem.code !== "inferred-number") }
}
