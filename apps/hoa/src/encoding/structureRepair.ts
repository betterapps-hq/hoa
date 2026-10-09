import { z } from "zod"
import type { Provision } from "@/schema/types"
import { checkStructure, type StructureCheck } from "./check"
import type { CleanDocument, CleanLine, PagePiece } from "./clean"
import { structureDocument, type StructuredDocument, type StructureOptions } from "./provisions"

// Structure repair (encoding.md, Structure 5): when the parser can't follow a document's numbering, hoa-structure-repair
// reads the cleaned text with the parser's outline and its problems and proposes where provisions start. Code applies
// the outline by starting a paragraph at every proposed marker and parsing again; the model never rewrites text, and
// the repaired structure is kept only when its check is better.

/** hoa-structure-repair's answer. */
export const structureRepairAnswer = z.object({
  markers: z.array(
    z.object({
      offset: z.number().int().nonnegative().describe("The marker's character offset in the document's text."),
      marker: z.string().min(1),
      level: z.number().int().positive()
    })
  )
})
export type StructureMarker = z.infer<typeof structureRepairAnswer>["markers"][number]

/** The cleaned text as the model reads it: lines joined by line breaks, with each line's offset. */
export function cleanText(clean: CleanDocument) {
  const offsets: number[] = []
  let offset = 0
  for (const line of clean.lines) {
    offsets.push(offset)
    offset += line.text.length + 1
  }
  return { text: clean.lines.map((line) => line.text).join("\n"), offsets }
}

function depthOf(provision: Provision, byLabel: ReadonlyMap<string, Provision>) {
  let depth = 1
  for (let label = provision.parentLabel; label !== null; label = byLabel.get(label)?.parentLabel ?? null) {
    depth += 1
  }
  return depth
}

/** Where each provision starts in the cleaned text: the line holding its first anchor. */
function provisionOffsets(clean: CleanDocument, offsets: readonly number[]) {
  const starts = new Map<string, number>()
  clean.lines.forEach((line, index) => {
    for (const piece of line.pieces) {
      starts.set(`${piece.page}:${piece.start}`, offsets[index] ?? 0)
    }
  })
  return (provision: Provision) => {
    const anchor = provision.anchors[0]
    return anchor ? (starts.get(`${anchor.page}:${anchor.start}`) ?? null) : null
  }
}

/** The parser's outline: each provision's offset, marker as printed (or label) and level, one per line. */
export function parserOutline(clean: CleanDocument, documents: readonly StructuredDocument[]) {
  const { offsets } = cleanText(clean)
  const offsetOf = provisionOffsets(clean, offsets)
  return documents
    .flatMap((document) => {
      const byLabel = new Map(document.provisions.map((provision) => [provision.label, provision]))
      return document.provisions.map((provision) => {
        const offset = offsetOf(provision)
        const marker = provision.num?.printed ?? provision.label
        return `${offset ?? "?"} "${marker}" level ${depthOf(provision, byLabel)} (${provision.key})`
      })
    })
    .join("\n")
}

/** Splits a line's pieces at a character position of its text, as near as the pieces allow. */
function splitPieces(pieces: readonly PagePiece[], position: number): [PagePiece[], PagePiece[]] {
  const before: PagePiece[] = []
  const after: PagePiece[] = []
  let consumed = 0
  for (const piece of pieces) {
    const length = piece.end - piece.start
    const cut = position - consumed
    if (cut >= length) {
      before.push(piece)
    } else if (cut <= 0) {
      after.push(piece)
    } else {
      before.push({ ...piece, end: piece.start + cut })
      after.push({ ...piece, start: piece.start + cut })
    }
    consumed += length + 1
  }
  return [before, after]
}

/** The cleaned text with a paragraph starting at every marker the model proposed. */
export function applyMarkers(clean: CleanDocument, markers: readonly StructureMarker[]): CleanDocument {
  const { offsets } = cleanText(clean)
  const cuts = new Map<number, number[]>()
  for (const { offset } of markers) {
    const index = offsets.findLastIndex((start) => start <= offset)
    if (index >= 0) {
      cuts.set(index, [...(cuts.get(index) ?? []), offset - (offsets[index] ?? 0)])
    }
  }
  const lines: CleanLine[] = []
  clean.lines.forEach((line, index) => {
    const positions = [...new Set(cuts.get(index) ?? [])].filter((p) => p < line.text.length).toSorted((a, b) => a - b)
    let rest = line
    let consumed = 0
    for (const position of positions) {
      const local = position - consumed
      if (local > 0) {
        const [before, after] = splitPieces(rest.pieces, local)
        lines.push({ ...rest, text: rest.text.slice(0, local).trimEnd(), pieces: before })
        rest = { ...rest, text: rest.text.slice(local), pieces: after }
        consumed = position
      }
      if (lines.at(-1)?.text !== "") {
        lines.push({ text: "", page: rest.page, headingLevel: null, pieces: [] })
      }
    }
    lines.push(rest)
  })
  return { ...clean, lines }
}

/** Whether one structure's check is better than another's: no repair needed, then fewer problems, then less outside. */
export function isBetter(candidate: StructureCheck, current: StructureCheck) {
  if (candidate.needsRepair !== current.needsRepair) {
    return !candidate.needsRepair
  }
  const serious = (check: StructureCheck) =>
    check.problems.filter((problem) => problem.code !== "inferred-number").length
  if (serious(candidate) !== serious(current)) {
    return serious(candidate) < serious(current)
  }
  return candidate.outside < current.outside
}

/** Structures the text again with the model's markers, keeping whichever structure checks better. */
export function repairStructure(
  clean: CleanDocument,
  options: StructureOptions,
  current: { documents: StructuredDocument[]; check: StructureCheck },
  markers: readonly StructureMarker[]
) {
  const repaired = applyMarkers(clean, markers)
  const documents = structureDocument(repaired, options)
  const check = checkStructure(repaired, documents)
  return isBetter(check, current.check) ? { documents, check, isRepaired: true } : { ...current, isRepaired: false }
}
