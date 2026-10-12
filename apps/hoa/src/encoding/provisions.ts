import type { Provision } from "@/schema/types"
import { anchorsOf, type CleanDocument, type CleanLine, type PagePiece } from "./clean"
import {
  decidePoint,
  isMarkerOnly,
  parseDivisionMarker,
  parseExhibitMarker,
  parseHeadingMarker,
  parsePointMarker,
  parseSectionMarker,
  readSection,
  renderPoint,
  type PointMarker,
  type SectionMarker,
  type PointReading
} from "./numbering"

// Split and key (encoding.md, Structure 3 and 4): cleaned lines become paragraphs, the numbering grammar turns them into
// a provision tree, and the tree becomes provisions with labels per schema.md (Sources): article-3, 3.1, 3.1(a),
// 3.1(a)(i), counted paragraphs 3.1/p2, definitions article-2/{term}, and an exhibit that is a document of its own
// labeled from its root (p1, a, a(i)).

export type StructureOptions = {
  documentKey: string
  fileId: string
  /** Exhibits the administrator marked as documents of their own: the printed letter and the document's key. */
  exhibitDocuments?: Readonly<Record<string, string>>
}

export type StructuredDocument = { key: string; provisions: Provision[] }

/** `level` is the heading's markdown level: 1 for the document's title, 2 and deeper for section headings. */
type Paragraph = { text: string; pieces: PagePiece[]; isHeading: boolean; level: number | null }

type NodeKind =
  | "preamble"
  | "part"
  | "article"
  | "section"
  | "point"
  | "paragraph"
  | "definition"
  | "exhibit"
  | "execution"

type Node = {
  kind: NodeKind
  name: string
  num: Provision["num"]
  heading: string | null
  own: string
  pieces: PagePiece[]
  items: Node[]
  parent: Node | null
  isDocumentRoot: boolean
  reading: PointReading | null
  sectionParts: number[]
  isDefinitions: boolean
  /**
   * How a top division is named: by a word and a number ("article", "section", "chapter"), by its number alone
   * ("number": numbered covenants with no divisions above them), or by its heading alone ("heading").
   */
  division: string | null
}

const spelledNumbers = [
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
  "twelve"
]
const connectors = new Set([
  "of",
  "and",
  "on",
  "to",
  "the",
  "for",
  "in",
  "a",
  "an",
  "or",
  "with",
  "by",
  "from",
  "as",
  "at"
])
const sentenceStarts = new Set([
  "The",
  "A",
  "An",
  "Each",
  "Every",
  "No",
  "Any",
  "All",
  "If",
  "In",
  "Upon",
  "Unless",
  "Except",
  "Such",
  "This",
  "These",
  "For",
  "Notwithstanding",
  "Subject",
  "Nothing",
  "Within"
])
const maxHeadingWords = 12

function node(kind: NodeKind, fields: Partial<Node> = {}): Node {
  return {
    kind,
    name: "",
    num: null,
    heading: null,
    own: "",
    pieces: [],
    items: [],
    parent: null,
    isDocumentRoot: false,
    reading: null,
    sectionParts: [],
    isDefinitions: false,
    division: null,
    ...fields
  }
}

// ─── Paragraphs ─────────────────────────────────────────────────────────────────────────────────

/** A line ending in a comma or a word no sentence ends on. */
const midSentence =
  /(,|\b(to|of|the|a|an|and|or|in|for|by|with|as|at|from|that|which|shall|be|is|are|any|such|its|their|his|her))$/i

/** A page break continues a paragraph when the next page starts in lowercase or the last one stopped mid-sentence. */
const continuesAcrossPage = (previous: CleanLine, line: CleanLine) =>
  /^[a-z]/.test(line.text) || midSentence.test(previous.text)

/** A scrap a scan read as a heading: "K", "at". */
const isFragment = (text: string) => text.replace(/\W/g, "").length <= 3 && !isMarkerOnly(text)

/** The longest unmarked paragraph read as an exhibit's heading rather than a sentence about one. */
const maxExhibitHeading = 60

/** An exhibit's marker, alone or with a title in capitals: "EXHIBIT Q", "Exhibit B", "EXHIBIT O LATTICE STYLES". */
function isExhibitHeading(text: string) {
  const marker = parseExhibitMarker(text)
  return marker !== null && text.length <= maxExhibitHeading && !/\p{Ll}/u.test(marker.rest)
}

/**
 * Whether a line ends a paragraph that opened with an exhibit's heading: the heading takes the title lines in capitals
 * under it, and the text that follows without a blank line ("Approved Colors (Revised 2025) …", a table) is its body.
 */
function endsExhibitHeading(current: readonly CleanLine[], line: CleanLine) {
  const first = current[0]
  if (!first || !isExhibitHeading(first.text)) {
    return false
  }
  const joined = [...current, line].map((each) => each.text).join(" ")
  return /\p{Ll}/u.test(line.text) || joined.length > maxExhibitHeading
}

/**
 * Blank lines end paragraphs; headings and marker-only lines ("(a)", "42") start new ones, and an exhibit's heading is
 * a paragraph of its own.
 */
export function paragraphsOf(clean: CleanDocument): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let current: CleanLine[] = []
  const close = () => {
    if (current.length > 0) {
      paragraphs.push({
        text: current.map((line) => line.text).join(" "),
        pieces: current.flatMap((line) => line.pieces),
        isHeading: false,
        level: null
      })
    }
    current = []
  }
  let isAfterBlank = false
  for (const line of clean.lines) {
    if (line.text === "") {
      isAfterBlank = true
      continue
    }
    if (line.headingLevel !== null && isFragment(line.text)) {
      continue
    }
    const previous = current.at(-1)
    if (line.headingLevel !== null) {
      close()
      paragraphs.push({ text: line.text, pieces: line.pieces, isHeading: true, level: line.headingLevel })
    } else {
      const isNewPage = previous !== undefined && previous.page !== line.page
      const breaks = previous && isNewPage ? !continuesAcrossPage(previous, line) : isAfterBlank
      if (breaks || isMarkerOnly(line.text) || endsExhibitHeading(current, line)) {
        close()
      }
      current.push(line)
    }
    isAfterBlank = false
  }
  close()
  return paragraphs
}

// ─── Headings and text ──────────────────────────────────────────────────────────────────────────

function titleCase(text: string) {
  if (/\p{Ll}/u.test(text)) {
    return text
  }
  return text
    .toLowerCase()
    .split(" ")
    .map((word, i) => (i > 0 && connectors.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")
}

const isTitleWord = (word: string, index: number) =>
  /^["“(]?[A-Z0-9]/.test(word) || (index > 0 && connectors.has(word.toLowerCase()))

/**
 * A heading at the start of a numbered paragraph: "Leasing. For purposes …", or, where the scan lost the period,
 * the Title Case words before the sentence starts ("Restrictions on Occupancy The Units …"). A section's whole
 * paragraph can be its heading; a point's needs a period.
 */
export function splitHeading(rest: string, isSection: boolean): { heading: string | null; text: string } {
  const words = rest.split(/\s+/).filter(Boolean)
  const first = words[0]
  if (!first || sentenceStarts.has(first)) {
    return { heading: null, text: rest }
  }
  let end = 0
  while (end < words.length && isTitleWord(words[end] ?? "", end)) {
    end += 1
  }
  const result = (count: number) => {
    const heading = words
      .slice(0, count)
      .join(" ")
      .replace(/[.:]["”]?$/, "")
    return heading.endsWith(",") ? null : { heading, text: words.slice(count).join(" ") }
  }
  const stop = words.slice(0, Math.min(end, maxHeadingWords)).findIndex((word) => /[.:]["”]?$/.test(word))
  if (stop >= 0) {
    return result(stop + 1) ?? { heading: null, text: rest }
  }
  if (end === words.length && isSection && end <= maxHeadingWords) {
    return result(end) ?? { heading: null, text: rest }
  }
  const start = words.slice(1, end).findLastIndex((word) => sentenceStarts.has(word)) + 1
  if (start > 0 && start <= maxHeadingWords && end < words.length) {
    return result(start) ?? { heading: null, text: rest }
  }
  return { heading: null, text: rest }
}

/** Ends with a colon, or mid-sentence: the paragraph leads into the list after it. */
function isLeadIn(text: string) {
  const trimmed = text.trim()
  return trimmed !== "" && (trimmed.endsWith(":") || !/[.;,!?"”')\]]$/.test(trimmed))
}

/** The text before the last sentence and the last sentence itself. */
function splitLastSentence(text: string): [string, string] {
  const boundaries = [...text.matchAll(/[.;!?]["”)]?\s+(?=["“(]?[A-Z])/g)]
  const last = boundaries.at(-1)
  if (!last) {
    return ["", text.trim()]
  }
  const at = last.index + last[0].length
  return [text.slice(0, at).trim(), text.slice(at).trim()]
}

// ─── Definitions ────────────────────────────────────────────────────────────────────────────────

const quotedName = /^\s*(?:,|or|and)?\s*["“'‘]+([^"“”]{1,80}?)[,.;:]?["”]+/

/** The names a definition paragraph defines: `"Record," "Recording," or "Recorded":` gives three. */
export function definedNames(text: string) {
  if (!/^["“'‘]+[A-Z]/.test(text)) {
    return []
  }
  // A quoted letter inside a name ("Class "B" Control Period") is kept apart while the names are read.
  let rest = text.replace(/"([A-Z0-9])"/g, "‹$1›")
  const names: string[] = []
  for (let found = quotedName.exec(rest); found; found = quotedName.exec(rest)) {
    names.push((found[1] ?? "").replace(/‹(.)›/g, '"$1"').trim())
    rest = rest.slice(found[0].length)
  }
  return names
}

const slugOf = (name: string) =>
  name
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/** A definition's label part: the first name, unless a later one is a distinct short name ("TRRS"), not a variant. */
export function definitionSlug(names: readonly string[]) {
  const [first, ...later] = names.map(slugOf)
  if (!first) {
    return null
  }
  const isVariant = (name: string) =>
    name.startsWith(first) || first.startsWith(name) || name.split("-").every((word) => first.split("-").includes(word))
  const last = later.at(-1)
  return last && !later.every(isVariant) ? last : first
}

// ─── The tree ───────────────────────────────────────────────────────────────────────────────────

class TreeBuilder {
  readonly roots = new Map<string, Node>()
  private document: Node
  private top: Node | null = null
  private sections: Node[] = []
  private points: Node[] = []
  private definition: Node | null = null
  private pendingHeading: Node | null = null

  constructor(private readonly options: StructureOptions) {
    this.document = this.root(options.documentKey)
  }

  private root(key: string) {
    const found = this.roots.get(key) ?? node("paragraph")
    this.roots.set(key, found)
    return found
  }

  private get article() {
    return this.top?.kind === "article" ? this.top : null
  }

  private append(parent: Node, child: Node) {
    child.parent = parent
    parent.items.push(child)
    return child
  }

  /** Paragraphs after the last item of a list of clauses belong to the list's parent, not the item. */
  private closePoint(point: Node) {
    const parent = point.parent
    if (!parent) {
      return
    }
    const siblings = parent.items.filter(
      (item) => item.kind === "point" && item.reading?.style === point.reading?.style
    )
    const clauses = siblings.slice(0, -1).filter((item) => /([;,:]|\b(and|or))$/.test(item.own.trim())).length
    const isClauseList =
      siblings.length > 1 ? clauses * 2 >= siblings.length - 1 : /([;,]|\b(and|or))$/.test(point.own.trim())
    if (!isClauseList) {
      return
    }
    const lastChild = point.items.findLastIndex((item) => item.kind !== "paragraph")
    const trailing = point.items.splice(lastChild + 1)
    const target = parent.kind === "paragraph" && parent.parent ? parent.parent : parent
    for (const item of trailing) {
      this.append(target, item)
    }
  }

  private closePoints(keep = 0) {
    while (this.points.length > keep) {
      const point = this.points.pop()
      if (point) {
        this.closePoint(point)
      }
    }
  }

  private closeAll() {
    this.closePoints()
    this.sections = []
    this.definition = null
    this.top = null
    this.pendingHeading = null
  }

  private host() {
    return this.points.at(-1) ?? this.definition ?? this.sections.at(-1) ?? this.top
  }

  heading(paragraph: Paragraph) {
    const pending = this.pendingHeading
    this.pendingHeading = null
    const text = paragraph.text
    const isMarker =
      parsePointMarker(text) !== null ||
      parseHeadingMarker(text) !== null ||
      parseExhibitMarker(text) !== null ||
      parseSectionMarker(text) !== null
    const isShort = text.length <= 80 && !/[.;]$/.test(text) && !/^["“(]/.test(text) && !isMarker
    if (pending && (paragraph.isHeading || isShort)) {
      pending.heading = titleCase(paragraph.text.replace(/\.$/, ""))
      pending.isDefinitions = pending.kind === "article" && /definition/i.test(pending.heading)
      pending.pieces.push(...paragraph.pieces)
      return true
    }
    return false
  }

  part(marker: { printed: string; number: number; rest: string }, paragraph: Paragraph) {
    this.closeAll()
    const name = `part-${spelledNumbers[marker.number - 1] ?? marker.number}`
    const heading = marker.rest ? titleCase(marker.rest) : null
    const num = { printed: marker.printed, normalized: String(marker.number), source: "printed" as const }
    this.top = this.append(this.document, node("part", { name, heading, num, pieces: paragraph.pieces }))
    this.pendingHeading = heading ? null : this.top
  }

  /** A numbered top division: an article, or a section or chapter in a document that doesn't use articles. */
  articleStart(marker: { printed: string; number: number; rest: string }, paragraph: Paragraph, word = "article") {
    this.closeAll()
    const heading = marker.rest ? titleCase(marker.rest.replace(/\.$/, "")) : null
    this.top = this.append(
      this.document,
      node("article", {
        name: `${word}-${marker.number}`,
        division: word,
        num: { printed: marker.printed, normalized: String(marker.number), source: "printed" },
        heading,
        isDefinitions: heading !== null && /definition/i.test(heading),
        sectionParts: [marker.number],
        pieces: paragraph.pieces
      })
    )
    this.pendingHeading = heading ? null : this.top
  }

  exhibit(letter: string, rest: string, paragraph: Paragraph) {
    this.closeAll()
    const documentKey = this.options.exhibitDocuments?.[letter]
    this.document = this.root(documentKey ?? this.options.documentKey)
    const heading = rest ? titleCase(rest) : null
    this.top = this.append(
      this.document,
      node("exhibit", {
        name: `exhibit-${letter.toLowerCase()}`,
        num: { printed: letter, normalized: letter.toLowerCase(), source: "printed" },
        heading,
        isDocumentRoot: documentKey !== undefined,
        pieces: paragraph.pieces
      })
    )
    this.pendingHeading = heading ? null : this.top
  }

  /** Whether a top division named by `word` starts here: before any division, or after one named the same way. */
  acceptsDivision(word: string) {
    const top = this.top
    return top === null || top.kind === "preamble" || top.division === word || top.division === "heading"
  }

  /**
   * A section heading with no number ("RECITALS", "DEFINITIONS") before the document's first numbered division, or
   * between such headings: a top division of its own, keyed by its heading.
   */
  headingDivision(paragraph: Paragraph) {
    const top = this.top
    const name = slugOf(paragraph.text)
    if (
      (paragraph.level ?? 1) < 2 ||
      name === "" ||
      !(top === null || top.kind === "preamble" || top.division === "heading")
    ) {
      return false
    }
    this.closeAll()
    const heading = titleCase(paragraph.text.replace(/\.$/, ""))
    // A heading printed twice (a contents page continued, a repeated title) keys as name-2, name-3.
    const taken = new Set(this.document.items.map((item) => item.name))
    let unique = name
    for (let suffix = 2; taken.has(unique); suffix += 1) {
      unique = `${name}-${suffix}`
    }
    this.top = this.append(
      this.document,
      node("article", {
        name: unique,
        heading,
        division: "heading",
        isDefinitions: /definition/i.test(heading),
        pieces: paragraph.pieces
      })
    )
    return true
  }

  /**
   * A numbered covenant in a document with no divisions above its numbers ("1. These restrictions …"): a top section,
   * when it's the next number; "1.1" under it is a subsection.
   */
  private numberedSection(marker: SectionMarker, paragraph: Paragraph) {
    const top = this.top
    const isNumbered = top?.division === "number"
    if (!(top === null || top.kind === "preamble" || isNumbered)) {
      return false
    }
    const deeper = isNumbered ? this.subsection(marker.parts) : null
    const [number] = marker.parts
    if (!deeper && (marker.parts.length !== 1 || number !== (isNumbered ? (top.sectionParts[0] ?? 0) + 1 : 1))) {
      return false
    }
    const split = paragraph.isHeading
      ? { heading: marker.rest.replace(/\.$/, "") || null, text: "" }
      : splitHeading(marker.rest, true)
    const parts = deeper?.parts ?? [number ?? 0]
    const fields = {
      name: parts.join("."),
      num: { printed: marker.printed, normalized: parts.join("."), source: "printed" as const },
      heading: split.heading,
      own: split.text,
      sectionParts: parts,
      pieces: paragraph.pieces
    }
    this.closePoints()
    this.definition = null
    if (deeper) {
      this.sections = this.sections.slice(0, this.sections.indexOf(deeper.parent) + 1)
      this.sections.push(this.append(deeper.parent, node("section", fields)))
      return true
    }
    this.closeAll()
    this.top = this.append(this.document, node("section", { ...fields, division: "number" }))
    this.sections = [this.top]
    return true
  }

  /** A section continuing the open article, or a dotted subsection of an open section. */
  section(text: string, paragraph: Paragraph) {
    const article = this.article
    const marker = parseSectionMarker(text)
    if (!marker) {
      return false
    }
    if (!article) {
      return this.numberedSection(marker, paragraph)
    }
    const articleNumber = article.sectionParts[0] ?? 0
    const deeper = this.subsection(marker.parts)
    const lastTop = article.items.findLast((item) => item.kind === "section")?.sectionParts[1] ?? 0
    const read = deeper ? null : readSection(marker, articleNumber, lastTop + 1, paragraph.isHeading)
    if (!deeper && !read) {
      return false
    }
    const parts = deeper?.parts ?? [articleNumber, read?.section ?? 0]
    const parent = deeper?.parent ?? article
    this.closePoints()
    this.definition = null
    this.sections = deeper ? this.sections.slice(0, this.sections.indexOf(parent) + 1) : []
    const split = paragraph.isHeading
      ? { heading: marker.rest.replace(/\.$/, "") || null, text: "" }
      : splitHeading(marker.rest, true)
    const section = this.append(
      parent,
      node("section", {
        name: parts.join("."),
        num: {
          printed: marker.printed,
          normalized: parts.join("."),
          source: read?.isInferred ? "inferred" : "printed"
        },
        heading: split.heading,
        own: split.text,
        sectionParts: parts,
        pieces: paragraph.pieces
      })
    )
    this.sections.push(section)
    return true
  }

  private subsection(parts: number[]) {
    if (parts.length < (this.top?.division === "number" ? 2 : 3)) {
      return null
    }
    const parent = this.sections.findLast(
      (open) => open.sectionParts.length === parts.length - 1 && open.sectionParts.every((part, i) => part === parts[i])
    )
    if (!parent) {
      return null
    }
    const last = parent.items.findLast((item) => item.kind === "section")?.sectionParts.at(-1) ?? 0
    return parts.at(-1) === last + 1 ? { parent, parts } : null
  }

  point(marker: PointMarker, next: PointMarker | null, paragraph: Paragraph) {
    const open = this.points.toReversed().map((point) => ({
      style: point.reading?.style ?? "lower",
      last: point.reading?.ordinal ?? 0
    }))
    const innermost = this.points.at(-1)
    const afterParagraph = innermost?.items.at(-1)?.kind === "paragraph"
    const decision = decidePoint(marker, open, next, afterParagraph)
    const host = this.host()
    if (!decision || !host) {
      return false
    }
    let parent: Node
    if (decision.action === "sibling") {
      this.closePoints(this.points.length - decision.depth)
      const sibling = this.points.pop()
      parent = sibling?.parent ?? host
    } else if (decision.action === "restart" && innermost) {
      const leadIn = innermost.items.at(-1)
      this.points.pop()
      this.closePoint(innermost)
      parent = leadIn ?? host
    } else {
      parent = host
    }
    const split = splitHeading(marker.rest, false)
    const isInferred = decision.action === "sibling" && decision.isInferred
    this.points.push(
      this.append(
        parent,
        node("point", {
          num: {
            printed: marker.printed,
            normalized: renderPoint(decision.reading),
            source: isInferred ? "inferred" : "printed"
          },
          heading: split.heading,
          own: split.text,
          reading: decision.reading,
          pieces: paragraph.pieces
        })
      )
    )
    return true
  }

  execution(paragraph: Paragraph) {
    this.closeAll()
    this.top = this.append(
      this.document,
      node("execution", { name: "execution", own: paragraph.text, pieces: paragraph.pieces })
    )
  }

  plain(paragraph: Paragraph) {
    const host = this.host()
    const names = this.article?.isDefinitions ? definedNames(paragraph.text) : []
    const slug = definitionSlug(names)
    if (this.article && slug) {
      this.closePoints()
      this.definition = this.append(
        this.sections.at(-1) ?? this.article,
        node("definition", { name: slug, heading: names.join(", "), own: paragraph.text, pieces: paragraph.pieces })
      )
      return
    }
    if (this.definition && this.points.length === 0) {
      this.definition.own += `\n\n${paragraph.text}`
      this.definition.pieces.push(...paragraph.pieces)
      return
    }
    if (!host) {
      this.top = this.append(
        this.document,
        node("preamble", { name: "preamble", own: paragraph.text, pieces: paragraph.pieces })
      )
      return
    }
    this.append(host, node("paragraph", { own: paragraph.text, pieces: paragraph.pieces }))
  }

  finish() {
    this.closeAll()
  }
}

/** OCR noise from a watermark or a stamp read as words: short, unpunctuated, with no number ("Esta", "Laser"). */
const isScrap = (paragraph: Paragraph) =>
  !paragraph.isHeading &&
  paragraph.text.length < 30 &&
  !/[.:;,)\]"”'\d]/.test(paragraph.text) &&
  (/^[a-z]/.test(paragraph.text) || !paragraph.text.includes(" "))

/** Retries a heading's marker without a short scan fragment before it ("Unoff. EXHIBIT "B"", "Un 8.7"). */
function withoutFragment(text: string) {
  const found = /^[A-Za-z0-9.]{1,6}\s+(.+)$/.exec(text)
  return found?.[1] ?? null
}

function build(paragraphs: readonly Paragraph[], options: StructureOptions) {
  const tree = new TreeBuilder(options)
  const markers = paragraphs.map((paragraph) => parsePointMarker(paragraph.text))
  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.text
    if (tree.heading(paragraph)) {
      return
    }
    const isMarker = markers[index] !== null || isMarkerOnly(text)
    if (!isMarker && (!/\p{L}/u.test(text) || isFragment(text) || isScrap(paragraph))) {
      return
    }
    const candidates = paragraph.isHeading ? [text, withoutFragment(text)] : [text]
    for (const candidate of candidates) {
      if (candidate === null) {
        continue
      }
      const heading = parseHeadingMarker(candidate)
      const isStandalone = paragraph.isHeading || candidate.length <= 120
      if (heading && isStandalone && heading.type === "article") {
        tree.articleStart(heading, paragraph)
        return
      }
      if (heading && isStandalone && heading.type === "part") {
        tree.part(heading, paragraph)
        return
      }
      const division = parseDivisionMarker(candidate)
      if (division && isStandalone && tree.acceptsDivision(division.word)) {
        tree.articleStart(division, paragraph, division.word)
        return
      }
      const exhibit = parseExhibitMarker(candidate)
      if (exhibit && (paragraph.isHeading || candidate.length <= maxExhibitHeading)) {
        tree.exhibit(exhibit.printed, exhibit.rest, paragraph)
        return
      }
    }
    if (/^IN WITNESS WHEREOF\b/i.test(text)) {
      tree.execution(paragraph)
      return
    }
    if (
      paragraph.isHeading &&
      markers[index] === null &&
      !parseSectionMarker(text) &&
      tree.headingDivision(paragraph)
    ) {
      return
    }
    const sectionCandidates = [text, withoutFragment(text)]
    if (sectionCandidates.some((candidate) => candidate !== null && tree.section(candidate, paragraph))) {
      return
    }
    const marker = markers[index]
    const next = markers.slice(index + 1).find((found) => found !== null) ?? null
    if (marker && tree.point(marker, next, paragraph)) {
      return
    }
    tree.plain(paragraph)
  })
  tree.finish()
  return tree.roots
}

// ─── Provisions ─────────────────────────────────────────────────────────────────────────────────

const mergesParagraphs = new Set<NodeKind>(["preamble", "part", "execution", "exhibit", "definition"])

function joinText(...parts: string[]) {
  return parts.filter((part) => part.trim() !== "").join("\n\n")
}

/** Decides a node's text, intro and wrap-up, and which of its paragraphs are counted provisions. */
function shape(current: Node) {
  const structural = current.items.filter((item) => item.kind !== "paragraph")
  const paragraphs = current.items.filter((item) => item.kind === "paragraph" && item.items.length === 0)
  const hasOwnText = current.own.trim() !== ""
  if (structural.length === 0 && paragraphs.length === current.items.length) {
    const merges =
      (mergesParagraphs.has(current.kind) && !current.isDocumentRoot) || (!hasOwnText && paragraphs.length === 1)
    if (merges) {
      current.own = joinText(current.own, ...paragraphs.map((item) => item.own))
      current.pieces.push(...paragraphs.flatMap((item) => item.pieces))
      current.items = []
      return { text: current.own, intro: null, wrapUp: null }
    }
  }
  // A heading whose only paragraph comes before its children: that paragraph is the provision's text.
  const [first, second] = current.items
  const isOnlyParagraph =
    !hasOwnText &&
    first?.kind === "paragraph" &&
    first.items.length === 0 &&
    second?.kind !== "paragraph" &&
    current.items.filter((item) => item.kind === "paragraph").length === 1
  const takesText = current.kind === "section" || (current.kind === "article" && !current.isDefinitions)
  if (isOnlyParagraph && takesText && !first.own.trim().endsWith(":")) {
    current.own = first.own
    current.pieces.push(...first.pieces)
    current.items = current.items.slice(1)
  }
  let text = current.own
  let intro: string | null = null
  let wrapUp: string | null = null
  const skipped = new Set<Node>()
  const firstChild = current.items.findIndex((item) => item.kind !== "paragraph")
  const before = current.items[firstChild - 1]
  if (firstChild > 0 && before?.items.length === 0 && before.own.trim().endsWith(":")) {
    intro = before.own
    skipped.add(before)
    current.pieces.push(...before.pieces)
  } else if (firstChild === 0 && isLeadIn(current.own)) {
    ;[text, intro] = splitLastSentence(current.own)
  }
  const lastChild = current.items.findLastIndex((item) => item.kind !== "paragraph")
  const after = current.items[lastChild + 1]
  if (lastChild >= 0 && after?.items.length === 0 && /^[a-z]/.test(after.own)) {
    wrapUp = after.own
    current.pieces.push(...after.pieces)
    current.items.splice(lastChild + 1, 1)
  }
  // Counted paragraphs number from the provision's own text; an intro takes its place in the count.
  let slot = hasOwnText ? 1 : 0
  for (const item of current.items.filter((child) => child.kind === "paragraph")) {
    slot += 1
    item.num = { printed: null, normalized: String(slot), source: "counted" }
  }
  current.items = current.items.filter((item) => !skipped.has(item))
  return { text, intro, wrapUp }
}

function emit(documentKey: string, root: Node, fileId: string) {
  const provisions: Provision[] = []
  const visit = (current: Node, parentLabel: string | null, label: string) => {
    const { text, intro, wrapUp } = shape(current)
    provisions.push({
      key: `${documentKey}:${label}`,
      kind: provisionKind(current.kind),
      num: current.num,
      label,
      heading: current.heading,
      parentLabel,
      intro,
      text: text.trim(),
      wrapUp,
      anchors: anchorsOf(current.pieces, fileId),
      noRule: null
    })
    const childPrefix = current.isDocumentRoot ? "" : label
    for (const item of current.items) {
      visit(item, label, labelOf(item, childPrefix))
    }
  }
  for (const top of root.items) {
    visit(top, null, top.name)
  }
  return provisions
}

function provisionKind(kind: NodeKind): Provision["kind"] {
  if (kind === "preamble") {
    return "recital"
  }
  if (kind === "part" || kind === "execution") {
    return "paragraph"
  }
  return kind
}

function labelOf(item: Node, prefix: string) {
  const number = item.num?.normalized ?? ""
  if (item.kind === "point") {
    return prefix ? `${prefix}(${number})` : number
  }
  if (item.kind === "paragraph") {
    return prefix ? `${prefix}/p${number}` : `p${number}`
  }
  if (item.kind === "definition") {
    return `${prefix}/${item.name}`
  }
  return item.name
}

/**
 * Structures one document's cleaned text into provisions (encoding.md, Structure 2 to 4). Exhibits named in
 * `exhibitDocuments` come back as documents of their own, after the main one.
 */
export function structureDocument(clean: CleanDocument, options: StructureOptions): StructuredDocument[] {
  const roots = build(paragraphsOf(clean), options)
  return [...roots].map(([key, root]) => ({ key, provisions: emit(key, root, options.fileId) }))
}
