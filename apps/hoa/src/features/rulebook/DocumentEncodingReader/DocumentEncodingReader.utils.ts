import { provisionBlocks, type ReadingBlock } from "@/documents/reading"
import { sentenceCase } from "@/lib/text"
import type { BuildResult } from "@/rulebook/buildResults"
import { parseStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { pluralOf } from "@/text/normalize"
import type { Shown } from "../DocumentEncodingFindings/DocumentEncodingFindings.motion"
import {
  gridFit,
  type Box,
  type FindKind,
  type PilesLayout
} from "../DocumentEncodingFindings/DocumentEncodingFindings.utils"

// The picture of a build that reads along with it (encoding.md, UX, The build's progress), a variation of
// DocumentEncodingFindings: the document itself in a window between the two piles, showing one thing at a time as the build's
// results name it. A term is marked where the document defines or first uses it; a passage is scanned and gets its
// verdict, the rules found in it, the settings it sets or why it holds none; a drafted rule shows its statement with
// blanks for its terms and values filling in. Each find flies into its pile. Nothing is listed: only what's being read
// shows. Coordinates are CSS pixels from the picture's top left.

/** A document the build has structured, laid out as the reader lays it out. */
export type ReaderDocument = {
  key: string
  title: string
  provisions: readonly T.Provision[]
  blocks: ReadingBlock[]
}

export function readerDocuments(
  documents: readonly { key: string; title: string; provisions: readonly T.Provision[] }[]
): ReaderDocument[] {
  return documents.map((document) => ({ ...document, blocks: provisionBlocks(document.provisions) }))
}

/** A passage of a document: one of its blocks. */
export type Spot = { documentKey: string; blockKey: string }

/** Words in a passage: a character range of its text or of its lead-in. */
export type WordSpot = Spot & { part: "text" | "intro"; start: number; end: number }

/** What the build made of a passage. */
export type Verdict =
  | { kind: "rules"; rules: { key: string; title: string }[] }
  | { kind: "settings"; settings: string[] }
  /** A definition, which rules cite instead of holding one. */
  | { kind: "definition" }
  /** No rule, with E's reason when it gave one: "heading", "recital", "reserved", "explanatory" or "duplicate". */
  | { kind: "none"; reason: string | null }

/** One thing the reader shows. Its id stays the same as more results come in. */
export type ReaderEvent =
  | { kind: "term"; id: string; label: string; spot: WordSpot | null }
  | { kind: "passage"; id: string; spot: Spot | null; verdict: Verdict }
  | {
      kind: "draft"
      id: string
      title: string
      statement: string | null
      /** Drafted again after a check found a problem with the draft before. */
      isRetry: boolean
      /** The draft before, when this one replaces it. */
      previous: string | null
      spot: Spot | null
    }

const nothing: Shown = { terms: 0, rules: 0, drafted: 0 }

/** What an event adds to the piles: a term, the rules found in a passage, or a rule drafted for the first time. */
export function findsOf(event: ReaderEvent): Shown {
  switch (event.kind) {
    case "term":
      return { ...nothing, terms: 1 }
    case "passage":
      return { ...nothing, rules: event.verdict.kind === "rules" ? event.verdict.rules.length : 0 }
    case "draft":
      return { ...nothing, drafted: event.isRetry ? 0 : 1 }
  }
}

export function countsOf(events: readonly ReaderEvent[]): Shown {
  return events.map(findsOf).reduce(
    (sum, finds) => ({
      terms: sum.terms + finds.terms,
      rules: sum.rules + finds.rules,
      drafted: sum.drafted + finds.drafted
    }),
    { ...nothing }
  )
}

/** Where each provision starts in the documents. */
function passageSpots(documents: readonly ReaderDocument[]) {
  return new Map(
    documents.flatMap((document) =>
      document.blocks.flatMap((block): [string, Spot][] =>
        block.type === "provision" && block.part === "main"
          ? [[block.provisionKey, { documentKey: document.key, blockKey: block.key }]]
          : []
      )
    )
  )
}

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(/\s+/g, "\\s+")

/** A term's label or its plural as whole words, in any case. */
function wordPattern(label: string) {
  const words = label.trim()
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped(pluralOf(words))}|${escaped(words)})(?![\\p{L}\\p{N}])`, "iu")
}

/** Where the documents name a term: in the definition that defines it, or else where they first use it. */
export function termSpot(label: string, documents: readonly ReaderDocument[]): WordSpot | null {
  const pattern = wordPattern(label)
  const name = label.trim().toLowerCase()
  const blocks = documents.flatMap((document) => document.blocks.map((block) => ({ document, block })))
  const defining = documents.flatMap((document) =>
    document.provisions
      .filter((provision) => provision.kind === "definition" && provision.heading?.trim().toLowerCase() === name)
      .map((provision) => provision.key)
  )
  const isDefining = ({ block }: (typeof blocks)[number]) =>
    block.type === "provision" && defining.includes(block.provisionKey)
  for (const { document, block } of [...blocks.filter(isDefining), ...blocks]) {
    const parts = [
      { part: "text" as const, text: block.text },
      { part: "intro" as const, text: block.type === "provision" ? block.intro : null }
    ]
    for (const { part, text } of parts) {
      const match = text ? pattern.exec(text) : null
      if (match) {
        const start = match.index
        return { documentKey: document.key, blockKey: block.key, part, start, end: start + match[0].length }
      }
    }
  }
  return null
}

type Outlines = Extract<BuildResult, { kind: "outlines" }>

/** Each provision of a section's answer with its verdict, in the answer's order. */
function passageEvents(
  result: Outlines,
  spots: ReadonlyMap<string, Spot>,
  definitions: ReadonlySet<string>
): ReaderEvent[] {
  const rulesOf = Map.groupBy(result.rules, (rule) => rule.provisionKey ?? "")
  const answered = new Map(result.provisions.map((provision) => [provision.key, provision]))
  return [...new Set([...answered.keys(), ...rulesOf.keys()])].map((key) => {
    const rules = (rulesOf.get(key) ?? []).map((rule) => ({ key: rule.key, title: rule.title }))
    const provision = answered.get(key)
    let verdict: Verdict = { kind: "none", reason: provision?.noRule ?? null }
    if (rules.length > 0) {
      verdict = { kind: "rules", rules }
    } else if (provision && provision.settings.length > 0) {
      verdict = { kind: "settings", settings: provision.settings }
    } else if (definitions.has(key)) {
      verdict = { kind: "definition" }
    }
    // A passage answered again with other rules is a new event; with the same rules, it's the one already shown.
    return {
      kind: "passage",
      id: `passage:${key}:${rules.map((rule) => rule.key).join(",")}`,
      spot: spots.get(key) ?? null,
      verdict
    }
  })
}

/**
 * What the reader shows from the build's results, in the order they came: each term once, where it's found; each
 * provision of a section's newest answer with its verdict; each rule as each round drafts it.
 */
export function readerEvents(results: readonly BuildResult[], documents: readonly ReaderDocument[]): ReaderEvent[] {
  const spots = passageSpots(documents)
  const definitions = new Set(
    documents.flatMap((document) =>
      document.provisions.filter((provision) => provision.kind === "definition").map((provision) => provision.key)
    )
  )
  const newest = new Map<string, Outlines>()
  for (const result of results) {
    const seen = result.kind === "outlines" ? newest.get(result.unitId) : undefined
    if (result.kind === "outlines" && (!seen || result.at >= seen.at)) {
      newest.set(result.unitId, result)
    }
  }
  const terms = new Set<string>()
  const statements = new Map<string, string | null>()
  return results.flatMap((result): ReaderEvent[] => {
    switch (result.kind) {
      case "terms":
      case "vocabulary":
        return result.labels.flatMap((label): ReaderEvent[] => {
          if (terms.has(label)) {
            return []
          }
          terms.add(label)
          return [{ kind: "term", id: `term:${label}`, label, spot: termSpot(label, documents) }]
        })
      case "outlines":
        return newest.get(result.unitId) === result ? passageEvents(result, spots, definitions) : []
      case "rules":
        return result.rules.map((rule): ReaderEvent => {
          const isRetry = statements.has(rule.key)
          const previous = statements.get(rule.key) ?? null
          statements.set(rule.key, rule.statement ?? null)
          return {
            kind: "draft",
            id: `draft:${result.id}:${rule.key}`,
            title: rule.title,
            statement: rule.statement ?? null,
            isRetry,
            previous,
            spot: rule.provisionKey === null ? null : (spots.get(rule.provisionKey) ?? null)
          }
        })
      default:
        return []
    }
  })
}

/** The passage after `spot` in reading order, across the documents and around again; the first when `spot` is null. */
export function nextSpot(documents: readonly ReaderDocument[], spot: Spot | null): Spot | null {
  const spots = documents.flatMap((document) =>
    document.blocks.map((block) => ({ documentKey: document.key, blockKey: block.key }))
  )
  const index = spot
    ? spots.findIndex((item) => item.documentKey === spot.documentKey && item.blockKey === spot.blockKey)
    : -1
  return spots[(index + 1) % Math.max(1, spots.length)] ?? null
}

/** A piece of a drafted rule's statement: words as written, or a blank for a term or a value that fills in. */
export type StatementPiece = { type: "text"; text: string } | { type: "blank"; kind: "term" | "value"; text: string }

/** A term link's words, from its key, plural when the link asks: the build's results carry no labels. */
export function termWords(key: string, plural: boolean) {
  const words = (key.split(".").at(-1) ?? key).replaceAll("-", " ")
  return plural ? pluralOf(words) : words
}

/** The numbers a statement states, in figures or words: the values its check compares. */
const valuePattern = /\$?\d+(?:[.,]\d+)*%?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi

/** A statement as words and blanks: a blank for each term link and each value. */
export function statementPieces(statement: string): StatementPiece[] {
  const pieces = parseStatement(statement).flatMap((part): StatementPiece[] => {
    if (part.type === "term") {
      return [{ type: "blank", kind: "term", text: termWords(part.key, part.plural) }]
    }
    const split: StatementPiece[] = []
    let end = 0
    for (const match of part.text.matchAll(valuePattern)) {
      if (match.index > end) {
        split.push({ type: "text", text: part.text.slice(end, match.index) })
      }
      split.push({ type: "blank", kind: "value", text: match[0] })
      end = match.index + match[0].length
    }
    if (end < part.text.length) {
      split.push({ type: "text", text: part.text.slice(end) })
    }
    return split
  })
  // A statement that opens with a term opens with a capital.
  const [first, ...rest] = pieces
  return first?.type === "blank" ? [{ ...first, text: sentenceCase(first.text) }, ...rest] : pieces
}

export const blankCount = (statement: string | null) =>
  statement === null ? 0 : statementPieces(statement).filter((piece) => piece.type === "blank").length

/** Under this width the window takes the whole width, with the piles under it. */
export const stackedBelow = 520
const gap = 20
/** The counts above each pile beside the window, and below each under it: a label, the count and what's drafted. */
const header = 66
const footer = 66
export const windowHeight = 288
/** The piles' height under the window: dots shrink to keep every find in it. */
const stackedGrid = 56

export type ReaderLayout = PilesLayout & {
  width: number
  height: number
  radius: number
  /** The window over the piles, rather than between them. */
  isStacked: boolean
  window: Box
  counts: Record<FindKind, Box>
  /** How high a find's flight may go: below the counts beside the window, the window's top above the piles. */
  ceiling: number
}

/**
 * The picture at `width` for this many finds of each kind: the window in the middle with a pile on each side, terms to
 * the left and rules to the right, each under its count; or, on a phone, the window over the two piles, their counts
 * under them.
 */
export function readerLayout(width: number, counts: Record<FindKind, number>): ReaderLayout {
  if (width > 0 && width < stackedBelow) {
    const side = (width - gap) / 2
    const gridTop = windowHeight + 16
    const fit = gridFit(side, counts, stackedGrid)
    const gridBottom = gridTop + fit.height
    return {
      width,
      height: gridBottom + footer,
      pitch: fit.pitch,
      radius: fit.pitch * 0.34,
      isStacked: true,
      window: { x: 0, y: 0, width, height: windowHeight },
      counts: {
        terms: { x: 0, y: gridBottom + 6, width: side, height: footer - 6 },
        rules: { x: side + gap, y: gridBottom + 6, width: side, height: footer - 6 }
      },
      gridBottom,
      terms: { inner: side, side: -1, columns: fit.columns },
      rules: { inner: side + gap, side: 1, columns: fit.columns },
      ceiling: 0
    }
  }
  const windowWidth = Math.min(340, Math.max(240, Math.round(width * 0.46)))
  const side = Math.max(0, (width - windowWidth - 2 * gap) / 2)
  const fit = gridFit(side, counts, windowHeight - header)
  const gridBottom = header + fit.height
  return {
    width,
    height: Math.max(windowHeight, gridBottom),
    pitch: fit.pitch,
    radius: fit.pitch * 0.34,
    isStacked: false,
    window: { x: side + gap, y: 0, width: windowWidth, height: windowHeight },
    counts: {
      terms: { x: 0, y: 0, width: side, height: header },
      rules: { x: width - side, y: 0, width: side, height: header }
    },
    gridBottom,
    terms: { inner: side, side: -1, columns: fit.columns },
    rules: { inner: width - side, side: 1, columns: fit.columns },
    ceiling: header - 4
  }
}

/** How long each part of a beat takes at its own pace, in milliseconds. */
export const beatMs = {
  /** The window moving to the passage. */
  move: 450,
  scan: 900,
  /** Each rule a passage holds, shown in turn. */
  rule: 800,
  /** Any other verdict. */
  verdict: 650,
  term: 1500,
  /** A term marked in its passage before its dot leaves. */
  mark: 350,
  blank: 240,
  /** A check's problem with the draft before, shown before drafting again. */
  problem: 1100,
  drafted: 900,
  /** A passage the window drifts to while nothing new has come. */
  drift: 2600
}

/** The parts of a beat: a scan, a verdict, a term found, a check's problem, blanks filling and the drafted rule. */
export type BeatPhase = "scan" | "verdict" | "found" | "problem" | "fill" | "drafted"

/** One moment of a beat: what shows from then, and what flies or fills. */
export type BeatStep = {
  /** Milliseconds into the beat. */
  at: number
  phase: BeatPhase
  /** The rule a passage's verdict shows, the blanks a draft has filled, or for a term, 1 once it's marked. */
  step: number
  /** How long it shows. */
  ms: number
  /** A find that leaves for its pile. */
  launch?: FindKind
  /** The next drafted rule's dot fills. */
  fills?: boolean
}

/** A beat's moments at `speed` times its own pace, and its length. */
export function beatPlan(event: ReaderEvent, speed = 1): { steps: BeatStep[]; length: number } {
  const ms = (value: number) => value / speed
  const steps: BeatStep[] = []
  const add = (at: number, step: Omit<BeatStep, "at" | "ms">, length: number) =>
    steps.push({ at: ms(at), ms: ms(length), ...step })
  switch (event.kind) {
    case "term":
      // The window gets to the passage, the term is marked in it, and then it leaves for its pile.
      add(0, { phase: "found", step: 0 }, beatMs.move)
      add(beatMs.move, { phase: "found", step: 1 }, beatMs.mark)
      add(
        beatMs.move + beatMs.mark,
        { phase: "found", step: 1, launch: "terms" },
        beatMs.term - beatMs.move - beatMs.mark
      )
      return { steps, length: ms(beatMs.term) }
    case "passage": {
      add(0, { phase: "scan", step: 0 }, beatMs.scan)
      if (event.verdict.kind !== "rules") {
        add(beatMs.scan, { phase: "verdict", step: 0 }, beatMs.verdict)
        return { steps, length: ms(beatMs.scan + beatMs.verdict) }
      }
      event.verdict.rules.forEach((_, index) =>
        add(beatMs.scan + index * beatMs.rule, { phase: "verdict", step: index, launch: "rules" }, beatMs.rule)
      )
      return { steps, length: ms(beatMs.scan + event.verdict.rules.length * beatMs.rule) }
    }
    case "draft": {
      const start = event.isRetry ? beatMs.problem : 0
      if (event.isRetry) {
        add(0, { phase: "problem", step: 0 }, beatMs.problem)
      }
      const blanks = blankCount(event.statement)
      add(start, { phase: "fill", step: 0 }, beatMs.move)
      for (let filled = 1; filled <= blanks; filled++) {
        add(start + beatMs.move + (filled - 1) * beatMs.blank, { phase: "fill", step: filled }, beatMs.blank)
      }
      const done = start + beatMs.move + blanks * beatMs.blank
      add(done, { phase: "drafted", step: blanks, ...(event.isRetry ? {} : { fills: true }) }, beatMs.drafted)
      return { steps, length: ms(done + beatMs.drafted) }
    }
  }
}

/**
 * How many times faster than their own pace beats play with `backlog` milliseconds of them waiting: their own pace
 * until they'd take longer than `budget`, then fast enough to fit it, up to `fastest`.
 */
export function paceOf(backlog: number, budget: number, fastest = 8) {
  return Math.min(fastest, Math.max(1, backlog / budget))
}

/** What the reader shows at a moment: a beat's moment, or the window drifting on or at rest. */
export type Scene = {
  /** The beat showing; null while the window drifts or rests. */
  event: ReaderEvent | null
  /** The passage the window is at. */
  spot: Spot | null
  phase: BeatPhase | "drift" | "rest"
  step: number
  /** How long this moment shows: the scan line's sweep. */
  ms: number
  /** How long the window takes to get to the passage. */
  moveMs: number
}

export const spotOf = ({ documentKey, blockKey }: Spot): Spot => ({ documentKey, blockKey })

/** The last thing the build named, at its last moment: what shows without motion. */
export function settledScene(events: readonly ReaderEvent[]): Scene {
  const event = events.at(-1)
  const last = event ? beatPlan(event).steps.at(-1) : undefined
  if (!event || !last) {
    return { event: null, spot: null, phase: "rest", step: 0, ms: 0, moveMs: 0 }
  }
  return { event, spot: event.spot ? spotOf(event.spot) : null, phase: last.phase, step: last.step, ms: 0, moveMs: 0 }
}
