import type { LayoutResult } from "./layoutResult"
import { normalizeForMatching, type DocumentLayout, type Page } from "./page"

export type BuildPagesOptions = {
  documentId: string
  /** "azure-layout@2024-11-30" */
  engine: string
  optionsHash: string
  /** Where a figure's cropped PNG is stored. */
  figureKey: (figureId: string) => string
  /** The section in effect where this range starts: the previous range's last section. */
  sectionAtStart: string | null
}

const lowConfidence = 0.8
const headingRoles = new Set(["title", "sectionHeading"])

function textOf(content: string, spans: readonly { offset: number; length: number }[]) {
  return spans.map((span) => content.slice(span.offset, span.offset + span.length)).join("")
}

/** Layout's Markdown marks page breaks, headers, footers and page numbers with HTML comments; the body drops them. */
function cleanBody(raw: string) {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function sectionName(heading: string) {
  const number = /^(\d+(?:\.\d+)*)\b/.exec(heading.trim())?.[1]
  return number ?? heading.trim()
}

function headingLevel(text: string, offset: number, heading: string) {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1
  const hashes = /^(#+)\s/.exec(text.slice(lineStart, offset + 1))?.[1]
  if (hashes) {
    return hashes.length
  }
  const number = /^(\d+(?:\.\d+)*)\b/.exec(heading)?.[1]
  return number ? number.split(".").length : 1
}

/**
 * Turns one Layout response (a document, or one 50-page range of it) into page records. Pure: the caller stores the
 * records and passes in where the previous range left off.
 */
export function buildPages(result: LayoutResult, options: BuildPagesOptions): Page[] {
  let currentSection = options.sectionAtStart
  return result.pages.map((layoutPage): Page => {
    const pageIndex = layoutPage.pageNumber
    const text = cleanBody(textOf(result.content, layoutPage.spans))
    const onPage = (regions: readonly { pageNumber: number }[]) => regions[0]?.pageNumber === pageIndex
    const paragraphs = result.paragraphs.filter((paragraph) => onPage(paragraph.boundingRegions))
    const byRole = (role: string) =>
      paragraphs.filter((paragraph) => paragraph.role === role).map((paragraph) => paragraph.content)

    const headings: Page["headings"] = []
    let headingCursor = 0
    for (const paragraph of paragraphs) {
      if (!paragraph.role || !headingRoles.has(paragraph.role)) {
        continue
      }
      const offset = text.indexOf(paragraph.content, headingCursor)
      if (offset === -1) {
        continue
      }
      headingCursor = offset + paragraph.content.length
      headings.push({ level: headingLevel(text, offset, paragraph.content), text: paragraph.content, offset })
    }

    const lowConfidenceSpans: Page["lowConfidenceSpans"] = []
    let wordCursor = 0
    for (const word of layoutPage.words) {
      const start = text.indexOf(word.content, wordCursor)
      if (start === -1) {
        continue
      }
      wordCursor = start + word.content.length
      if (word.confidence < lowConfidence) {
        lowConfidenceSpans.push({ start, end: wordCursor })
      }
    }

    const checkboxes = layoutPage.selectionMarks.map((mark) => {
      const after = result.content.slice(mark.span.offset + mark.span.length).split("\n")[0] ?? ""
      const before = result.content.slice(0, mark.span.offset).split("\n").pop() ?? ""
      const label = (after.replace(/[☒☐]/g, "").trim() || before.replace(/[☒☐]/g, "").trim()).slice(0, 160)
      return { label, state: mark.state }
    })

    const sectionAtTop = currentSection
    const lastSection = paragraphs.findLast((paragraph) => paragraph.role === "sectionHeading")
    if (lastSection) {
      currentSection = sectionName(lastSection.content)
    }

    const pageNumber = paragraphs.find((paragraph) => paragraph.role === "pageNumber")?.content.trim()
    const confidences = layoutPage.words.map((word) => word.confidence)
    return {
      documentId: options.documentId,
      pageIndex,
      pageLabel: pageNumber || null,
      labelSource: pageNumber ? "page-number" : null,
      engine: options.engine,
      optionsHash: options.optionsHash,
      text,
      normalizedText: normalizeForMatching(text),
      header: byRole("pageHeader").join("\n") || null,
      footer: byRole("pageFooter").join("\n") || null,
      headings,
      sectionAtTop,
      checkboxes,
      figures: result.figures
        .filter((figure) => onPage(figure.boundingRegions))
        .map((figure) => ({
          id: figure.id,
          caption: figure.caption?.content ?? null,
          imageKey: options.figureKey(figure.id)
        })),
      minConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
      lowConfidenceSpans
    }
  })
}

function mostCommon<T>(values: readonly T[]) {
  const counts = new Map<T, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best: { value: T; count: number } | undefined
  for (const [value, count] of counts) {
    if (!best || count > best.count) {
      best = { value, count }
    }
  }
  return best
}

/**
 * The document-wide pass (`ocr:labels`): printed labels for pages without a page number, from the most common offset
 * between printed and PDF numbers, and lines repeated on most pages (watermarks, running heads, recording stamps).
 */
export function computeDocumentLayout(pages: readonly Page[]): DocumentLayout {
  const offsets = pages.flatMap((page) => {
    const printed = Number(page.pageLabel)
    return page.labelSource === "page-number" && Number.isInteger(printed) ? [printed - page.pageIndex] : []
  })
  const offset = mostCommon(offsets)
  const labels: Record<string, string> = {}
  if (offset && offset.count >= 2) {
    for (const page of pages) {
      const label = page.pageIndex + offset.value
      if (!page.pageLabel && label > 0) {
        labels[String(page.pageIndex)] = String(label)
      }
    }
  }

  const pagesWithLine = new Map<string, number>()
  for (const page of pages) {
    const lines = new Set(
      page.text
        .split("\n")
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .filter((line) => line.length >= 4)
    )
    for (const line of lines) {
      pagesWithLine.set(line, (pagesWithLine.get(line) ?? 0) + 1)
    }
  }
  const repeatedLines = [...pagesWithLine]
    .filter(([, count]) => count >= 3 && count > pages.length / 2)
    .map(([line]) => line)
  return { labels, repeatedLines }
}
