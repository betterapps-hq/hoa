import { ImageIcon } from "lucide-react"
import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import type { ReadingBlock, ReadingPage } from "@/documents/reading"
import { cn } from "@/lib/utils"
import { highlightRanges, rehypeHighlights } from "../DocumentViewer/DocumentViewer.utils"
import { pageName, splitAt, splitFigures, wordRanges } from "./DocumentReader.utils"

// The document's text as the reader lays it out: headings by level with their numbers, numbered provisions with the
// number hanging in the margin, indented by depth, page markers in the flow, and the cited passage and search matches
// marked.

/** How a block is marked: the passage opened at, another citation or an extra highlight, or nothing. */
export type BlockTone = "target" | "related" | null

const markClass = "rounded-[3px] bg-yellow-200 px-px text-foreground dark:bg-yellow-400/30"

function Marked({ text, words }: { text: string; words: readonly string[] }) {
  const ranges = wordRanges(text, words)
  if (ranges.length === 0) {
    return text
  }
  return splitAt(text, ranges).map((piece, index) =>
    piece.isMarked ? (
      // Pieces never reorder; the index is their identity.
      <mark key={index} className={markClass}>
        {piece.text}
      </mark>
    ) : (
      piece.text
    )
  )
}

/** Text as paragraphs: a blank line starts a new one, a single line break stays a line break. */
function Paragraphs({ text, words, className }: { text: string; words: readonly string[]; className?: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== "")
  return paragraphs.map((paragraph, index) => (
    // Paragraphs of one block never reorder.
    <p key={index} className={cn("whitespace-pre-line", index > 0 && "mt-3", className)}>
      <Marked text={paragraph.trim()} words={words} />
    </p>
  ))
}

/** Indentation for a depth: articles and their sections sit at the margin, each level below steps in. */
const indentClass = (depth: number) =>
  ["", "", "pl-4 @2xl/reader:pl-6", "pl-8 @2xl/reader:pl-12", "pl-12 @2xl/reader:pl-16"][Math.min(depth, 4)] ?? ""

export const toneClass: Record<Exclude<BlockTone, null>, string> = {
  // A calm tint and a rule on the left, in both themes, so the passage reads as marked without relying on color.
  target: "bg-amber-100/60 before:bg-amber-500 dark:bg-amber-300/[0.07] dark:before:bg-amber-400",
  related: "bg-muted/60 before:bg-muted-foreground/40"
}

const headingClass = {
  2: "text-xl font-semibold tracking-tight text-balance @2xl/reader:text-2xl",
  3: "text-base font-semibold @2xl/reader:text-lg",
  4: "text-[0.95rem] font-semibold @2xl/reader:text-base"
} as const

const headingSpace = { 2: "mt-14 mb-5", 3: "mt-9 mb-3", 4: "mt-6 mb-2" } as const

export const toneLabel: Record<Exclude<BlockTone, null>, string> = {
  target: "Cited passage",
  related: "Also cited"
}

export type ReaderBlockProps = {
  block: ReadingBlock
  /** The search's words to mark, when this block matches it. */
  words: readonly string[]
  isFirst: boolean
  /** Shows this block in the original document, where its figures are; absent when there's no original. */
  onShowOriginal?: () => void
}

/** Stands in for an image the text can't show: its caption, and a way to see it in the original. */
function FigurePlaceholder({ caption, onShow }: { caption: string | null; onShow?: () => void }) {
  return (
    <div className="my-4 flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <span className="flex min-w-0 items-center gap-2">
        <ImageIcon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{caption ? `Figure: ${caption}` : "Figure"}</span>
      </span>
      {onShow ? (
        <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-link" onClick={onShow}>
          See it in the original
        </Button>
      ) : null}
    </div>
  )
}

/** One block of the document: a heading, a provision, text outside any provision, or an unstructured page. */
export function ReaderBlock({ block, words, isFirst, onShowOriginal }: ReaderBlockProps) {
  const common = {
    "data-block": block.key,
    tabIndex: -1,
    className:
      "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
  }

  if (block.type === "page") {
    return (
      <div {...common} className={cn(common.className, "reader-markdown")}>
        {splitFigures(block.text).map((piece, index) =>
          // A page's pieces never reorder; the index is their identity.
          piece.type === "figure" ? (
            <FigurePlaceholder key={index} caption={piece.caption} onShow={onShowOriginal} />
          ) : (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[
                rehypeHighlights(
                  words.length > 0
                    ? highlightRanges(wordRanges(piece.text, words).map((range) => ({ range, tone: markClass })))
                    : []
                )
              ]}
            >
              {piece.text}
            </ReactMarkdown>
          )
        )}
      </div>
    )
  }

  if (block.type === "outside") {
    return (
      <div {...common} className={cn(common.className, "mt-4", indentClass(block.depth))}>
        <Paragraphs text={block.text} words={words} />
      </div>
    )
  }

  if (block.heading !== null && block.level !== null) {
    // The document's title is the reader's h2, so its articles are h3.
    const Heading = ({ 2: "h3", 3: "h4", 4: "h5" } as const)[block.level]
    return (
      <div
        {...common}
        className={cn(common.className, isFirst ? "mt-0" : headingSpace[block.level], indentClass(block.depth))}
      >
        <Heading className={headingClass[block.level]}>
          {block.number ? (
            <span
              className={cn(
                "tabular-nums",
                block.level === 2 ? "mb-1 block text-sm font-medium tracking-normal text-muted-foreground" : "mr-2"
              )}
            >
              <Marked text={block.number} words={words} />
            </span>
          ) : null}
          <Marked text={block.heading} words={words} />
        </Heading>
        {block.text ? <Paragraphs text={block.text} words={words} className="mt-3" /> : null}
        {block.intro ? <Paragraphs text={block.intro} words={words} className="mt-3" /> : null}
      </div>
    )
  }

  const body = (
    <>
      {block.text ? <Paragraphs text={block.text} words={words} /> : null}
      {block.intro ? <Paragraphs text={block.intro} words={words} className={block.text ? "mt-3" : ""} /> : null}
    </>
  )
  // A counted paragraph continues its parent's text, so it sits at its parent's indent.
  const indent = block.part === "main" && block.number === null && block.depth > 0 ? block.depth - 1 : block.depth
  return (
    <div {...common} className={cn(common.className, "mt-4", indentClass(indent))}>
      {block.number ? (
        <div className="flex gap-3">
          <span className="min-w-7 shrink-0 font-medium text-foreground/70 tabular-nums">
            <Marked text={block.number} words={words} />
          </span>
          <div className="min-w-0 flex-1">{body}</div>
        </div>
      ) : (
        body
      )}
    </div>
  )
}

/**
 * A run of blocks marked together: the cited provision with everything under it, or another citation. A calm tint and
 * a rule on the left, named for screen readers, and focusable so opening at it moves focus there.
 */
export function MarkedRun({
  tone,
  startKey,
  children
}: {
  tone: Exclude<BlockTone, null>
  startKey: string
  children: ReactNode
}) {
  return (
    <section
      data-run-start={startKey}
      tabIndex={-1}
      aria-label={toneLabel[tone]}
      className={cn(
        "relative -mx-3 mt-6 rounded-md px-3 pt-px pb-4 outline-none before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full transition-[background-color,box-shadow] duration-500 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none @2xl/reader:-mx-4 @2xl/reader:px-4 [&>[data-block]:first-child]:mt-3",
        toneClass[tone]
      )}
    >
      {children}
    </section>
  )
}

/** A page boundary in the flow, so a reader can match the paper. */
export function PageMarker({ page, fileTitle }: { page: ReadingPage; fileTitle?: string }) {
  const name = pageName(page, fileTitle)
  return (
    <div
      data-page-marker={`${page.fileId}:${page.page}`}
      className="my-8 flex items-center gap-3 text-xs text-muted-foreground first:mt-0"
    >
      <hr aria-label={name} className="h-px flex-1 border-0 bg-border" />
      <span aria-hidden className="tabular-nums">
        {name}
      </span>
    </div>
  )
}
