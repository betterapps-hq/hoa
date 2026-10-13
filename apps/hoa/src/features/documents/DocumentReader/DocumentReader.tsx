import { useReducedMotion, useUncontrolled } from "@mantine/hooks"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileClockIcon,
  FileQuestionMarkIcon,
  FileTextIcon,
  FileXIcon,
  ListIcon,
  type LucideIcon
} from "lucide-react"
import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isUnavailable, type DocumentReading, type ReadingBlock, type ReadingUnavailable } from "@/documents/reading"
import { citationTitle } from "@/features/rulebook/citedProvision"
import { citationLabel } from "@/features/rulebook/rulebookRecords"
import { useSearch } from "@/hooks/useSearch"
import type { SearchSetup } from "@/lib/search"
import { cn } from "@/lib/utils"
import { citationHref } from "../citationLink"
import { documentFileUrl } from "../documentFile"
import { getDocumentReading, locateProvisions } from "../documents.functions"
import { ReaderLink } from "../ReaderLink/ReaderLink"
import {
  blockContexts,
  blockTitle,
  blockTones,
  groupsOf,
  pageMarkers,
  queryWords,
  runsOf,
  type BlockContext
} from "./DocumentReader.utils"
import { markedRanges, startOf } from "./originalMarks"
import type { OriginalGoal } from "./OriginalView"
import { ReaderNav, type SearchResult } from "./ReaderNav"
import { MarkedRun, PageMarker, ReaderBlock } from "./ReaderText"

// The original view loads pdf.js, so it loads only when it's shown.
const OriginalView = lazy(() => import("./OriginalView"))

type ReaderView = "text" | "original"

const viewKey = "document-reader-view"

/**
 * The view a reader opens in: the person's last choice; otherwise the original on a wide screen when passages can be
 * marked on it, and the text on a phone, where a page is too small to read.
 */
function initialView(reading: DocumentReading): ReaderView {
  try {
    const stored = window.localStorage.getItem(viewKey)
    if (stored === "text" || stored === "original") {
      return stored
    }
  } catch {
    // Storage can be blocked; the default stands.
  }
  return reading.original?.hasWordBoxes && window.matchMedia("(min-width: 64rem)").matches ? "original" : "text"
}

function rememberView(view: ReaderView) {
  try {
    window.localStorage.setItem(viewKey, view)
  } catch {
    // Storage can be blocked; the choice lasts for this reader only.
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** Why a document can't be read, in words, and whether trying again could help. */
function unavailableText(reason: ReadingUnavailable): {
  icon: LucideIcon
  title: string
  description: string
  canRetry: boolean
} {
  switch (reason.unavailable) {
    case "removed":
      return {
        icon: FileXIcon,
        title: "This document was removed",
        description: `${reason.title} was removed from your governing documents on ${dateFormat.format(new Date(reason.removedAt))}.`,
        canRetry: false
      }
    case "missing":
      return {
        icon: FileQuestionMarkIcon,
        title: "This document isn’t available",
        description: "It isn’t one of your governing documents.",
        canRetry: false
      }
    case "not-ready":
      return reason.hasFailed
        ? {
            icon: FileXIcon,
            title: "This document couldn’t be read",
            description: `${reason.title} couldn’t be read. Upload it again from your governing documents.`,
            canRetry: false
          }
        : {
            icon: FileClockIcon,
            title: "This document isn’t ready yet",
            description: `${reason.title} is still being read. Try again in a few minutes.`,
            canRetry: true
          }
  }
}

function OriginalSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-hidden bg-muted/40 px-4 py-6 dark:bg-muted/20">
      <Skeleton className="aspect-[8.5/11] w-full max-w-3xl rounded-[2px]" />
    </div>
  )
}

/** Where the reader is: a document, and the provision it opened at. */
export type ReaderTarget = { documentId: string; provision: string | null }

export type DocumentReaderProps = {
  /** The upload to read: the id the original file and the reader's URL use. */
  documentId: string
  /** The provision to open at, highlighted and focused; null opens at the top. */
  provision?: string | null
  /** A rule's citations, in order, to step through; the provision is one of them. */
  cites?: readonly string[]
  /** More provisions to mark, more quietly than the one opened at, such as covered passages. */
  highlights?: readonly string[]
  /**
   * Called when the reader moves to another citation (possibly in another document); with it, the parent owns the
   * target, as the route does through its URL. Without it, the reader steps on its own.
   */
  onNavigate?: (target: ReaderTarget) => void
  className?: string
}

const noWords: readonly string[] = []

const searchSetup: SearchSetup<ReadingBlock> = {
  id: (block) => block.key,
  fields: {
    number: { text: (block) => (block.type === "provision" ? (block.number ?? "") : ""), boost: 3 },
    heading: { text: (block) => (block.type === "provision" ? (block.heading ?? "") : ""), boost: 2 },
    text: { text: (block) => (block.type === "provision" ? `${block.text}\n${block.intro ?? ""}` : block.text) }
  }
}

/** The reader's measure: the text fills the width, capped on very wide containers so lines stay readable. */
const column = "mx-auto w-full max-w-[56rem]"
const gutter = "px-4 @2xl/reader:px-6"
const measure = `${column} ${gutter}`

/**
 * A governing document to read whole (docs/ux.md, Citations; documents/docs/reader.md): continuous text in its
 * structure, opened at a cited passage with the passage highlighted and focused, with its outline, a search, page
 * markers that match the paper, and stepping through a rule's citations. It fills its container's height and lays
 * itself out by its own width, so it works as a page, in a sheet beside other work, and on a phone.
 */
export function DocumentReader({
  documentId: documentIdProp,
  provision: provisionProp = null,
  cites = [],
  highlights = [],
  onNavigate,
  className
}: DocumentReaderProps) {
  const [target, setTarget] = useUncontrolled<ReaderTarget>({
    value: onNavigate ? { documentId: documentIdProp, provision: provisionProp } : undefined,
    defaultValue: { documentId: documentIdProp, provision: provisionProp },
    onChange: onNavigate
  })
  const { documentId, provision } = target
  const reading = useQuery({
    queryKey: ["document-reading", documentId],
    queryFn: () => getDocumentReading({ data: { documentId } }),
    staleTime: 5 * 60 * 1000
  })
  const loaded = reading.data && !isUnavailable(reading.data) ? reading.data : null
  const unavailable = reading.data && isUnavailable(reading.data) ? unavailableText(reading.data) : null
  const locations = useQuery({
    queryKey: ["provision-locations", cites],
    queryFn: () => locateProvisions({ data: { keys: [...cites] } }),
    enabled: cites.length > 1,
    staleTime: 5 * 60 * 1000
  })

  return (
    <div className={cn("@container/reader flex h-full min-h-0 flex-col bg-background", className)}>
      {loaded ? (
        <LoadedReader
          key={loaded.id}
          reading={loaded}
          provision={provision}
          cites={cites}
          highlights={highlights}
          onStep={(key) => {
            const isHere = loaded.blocks.some((block) => block.type === "provision" && block.provisionKey === key)
            const documentOfKey = isHere ? documentId : locations.data?.[key]?.documentId
            if (documentOfKey) {
              setTarget({ documentId: documentOfKey, provision: key })
            }
          }}
          stepNames={Object.fromEntries(
            Object.entries(locations.data ?? {}).map(([key, location]) => [key, location.heading])
          )}
        />
      ) : null}
      {unavailable ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <unavailable.icon />
            </EmptyMedia>
            <EmptyTitle>{unavailable.title}</EmptyTitle>
            <EmptyDescription>{unavailable.description}</EmptyDescription>
          </EmptyHeader>
          {unavailable.canRetry ? (
            <EmptyContent>
              <Button variant="outline" onClick={() => void reading.refetch()}>
                Try again
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}
      {reading.error && !reading.data ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>This document can&rsquo;t be shown</EmptyTitle>
            <EmptyDescription>{reading.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void reading.refetch()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
      {reading.isPending ? <ReaderSkeleton /> : null}
    </div>
  )
}

function ReaderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading the document">
      <div className="border-b py-3">
        <div className={cn(measure, "flex flex-col gap-2")}>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className={cn(measure, "flex flex-col gap-3 py-8")}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mb-4 h-7 w-1/2" />
        {[100, 96, 98, 72, 0, 100, 94, 88].map((width, index) =>
          width === 0 ? (
            <div key={index} className="h-3" />
          ) : (
            <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />
          )
        )}
      </div>
    </div>
  )
}

type LoadedReaderProps = {
  reading: DocumentReading
  provision: string | null
  cites: readonly string[]
  highlights: readonly string[]
  onStep: (provisionKey: string) => void
  /** The headings of citations in other documents, for the stepper. */
  stepNames: Record<string, string | null>
}

/** How far down the scroller a passage opened at sits: near the top third, below the sticky context line. */
const openAt = 0.22

function LoadedReader({ reading, provision, cites, highlights, onStep, stepNames }: LoadedReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const isReducedMotion = useReducedMotion() === true
  const [query, setQuery] = useState("")
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const hasMoved = useRef(false)

  const { blocks } = reading
  const groups = groupsOf(blocks)
  const markers = pageMarkers(reading)
  const contexts = blockContexts(blocks)
  const fileTitles = new Map(
    reading.files.filter((file) => file.id !== reading.id).map((file) => [file.id, file.title])
  )
  const search = useSearch(blocks, searchSetup)
  const words = query.trim() === "" ? noWords : queryWords(query)
  const matchedIds = search.ids(query)
  const matched = new Set(matchedIds ?? [])
  const results: SearchResult[] | null =
    matchedIds === null
      ? null
      : search.rank(blocks, query).map((block) => ({ block, context: contexts.get(block.key) }))

  const targetKeys = new Set(
    blocks.flatMap((block) => (block.type === "provision" && block.provisionKey === provision ? [block.key] : []))
  )
  const related = new Set([...cites.filter((key) => key !== provision), ...highlights])
  const tones = blockTones(blocks, (key) => {
    if (key === provision) {
      return "target"
    }
    return related.has(key) ? "related" : null
  })

  const scrollToBlock = (key: string, { isSmooth }: { isSmooth: boolean }) => {
    const container = scrollRef.current
    const find = () =>
      container?.querySelector<HTMLElement>(`[data-run-start="${CSS.escape(key)}"]`) ??
      container?.querySelector<HTMLElement>(`[data-block="${CSS.escape(key)}"]`)
    const element = find()
    if (!container || !element) {
      return
    }
    const offset = (target: HTMLElement) =>
      target.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight * openAt
    container.scrollTo({
      top: Math.max(0, container.scrollTop + offset(element)),
      behavior: isSmooth && !isReducedMotion ? "smooth" : "auto"
    })
    element.focus({ preventScroll: true })
    // Articles off screen are laid out only when they come near, so the text above can grow once it's reached: settle
    // on the passage again once the scroll ends, until it stays put.
    let tries = 0
    const settle = () => {
      const current = find()
      const off = current ? offset(current) : 0
      if (Math.abs(off) > 4 && container.scrollTop + off > 0 && tries < 8) {
        tries += 1
        container.scrollTo({ top: container.scrollTop + off, behavior: "auto" })
        requestAnimationFrame(settle)
      }
    }
    if (isSmooth && !isReducedMotion && "onscrollend" in container) {
      container.addEventListener("scrollend", () => requestAnimationFrame(settle), { once: true })
    } else {
      requestAnimationFrame(settle)
    }
  }

  const [firstTarget] = targetKeys
  const blockByKey = new Map(blocks.map((block) => [block.key, block]))
  const canShowOriginal = reading.original !== null
  const [view, setView] = useState<ReaderView>(() => (canShowOriginal ? initialView(reading) : "text"))
  const isOriginal = view === "original" && canShowOriginal
  const [originalPage, setOriginalPage] = useState(1)
  const originalGoalOf = (key: string | undefined, request: number, isSmooth: boolean): OriginalGoal | null => {
    const start = startOf(key ? blockByKey.get(key) : undefined, reading.id)
    return start
      ? {
          page: start.page,
          start: start.hasRange ? start.start : null,
          end: start.hasRange ? start.end : null,
          request,
          isSmooth
        }
      : null
  }
  // Where each view goes next; `request` counts the moves, so going to the same place again still moves.
  const [textGoal, setTextGoal] = useState(firstTarget ? { key: firstTarget, request: 0, isSmooth: false } : null)
  const [originalGoal, setOriginalGoal] = useState(() => originalGoalOf(firstTarget, 0, false))
  const requests = useRef(0)
  const goTo = (key: string, isSmooth: boolean, inView: ReaderView = isOriginal ? "original" : "text") => {
    requests.current += 1
    if (inView === "original") {
      setOriginalGoal(originalGoalOf(key, requests.current, isSmooth) ?? originalGoal)
    } else {
      setTextGoal({ key, request: requests.current, isSmooth })
    }
  }

  useEffect(() => {
    if (textGoal && !isOriginal) {
      scrollToBlock(textGoal.key, { isSmooth: textGoal.isSmooth })
    }
    // The text moves only when it's asked to; scrollToBlock reads refs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [textGoal])

  // Stepping to another citation moves to it, smoothly.
  useEffect(() => {
    if (!hasMoved.current) {
      hasMoved.current = true
      return
    }
    if (firstTarget) {
      goTo(firstTarget, true)
    }
    // Only a new target moves the view.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [firstTarget])

  /** Opens the original at a block, such as a page whose figure the text can't show. */
  const showOriginalAt = (key: string) => {
    rememberView("original")
    setView("original")
    goTo(key, false, "original")
  }

  /** Switches between the text and the original, keeping the place: the same passage, or the same page. */
  const switchView = (next: ReaderView) => {
    if (next === view) {
      return
    }
    rememberView(next)
    setView(next)
    if (next === "original") {
      goTo(current ?? firstTarget ?? blocks[0]?.key ?? "", false, "original")
      return
    }
    const targetBlock = firstTarget ? blockByKey.get(firstTarget) : undefined
    const onPage =
      targetBlock?.at?.fileId === reading.id && targetBlock.at.page === originalPage
        ? targetBlock
        : blocks.find((block) => block.at?.fileId === reading.id && block.at.page >= originalPage)
    if (onPage) {
      goTo(onPage.key, false, "text")
    }
  }

  // Follow the reading position, for the context line, the outline and "Open the original".
  useEffect(() => {
    const container = scrollRef.current
    if (!container) {
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      setCurrent(currentBlock(container))
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update)
      }
    }
    update()
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const go = (key: string) => {
    setIsNavOpen(false)
    // Let a closing sheet hand focus back before moving it to the passage.
    requestAnimationFrame(() => goTo(key, true))
  }

  const context: BlockContext | undefined = current ? contexts.get(current) : undefined
  const currentKeys = new Set([context?.article?.key, context?.section?.key].filter((key) => key !== undefined))
  const contextLine = [context?.article, context?.section]
    .flatMap((block) => (block ? [blockTitle(block)] : []))
    .filter((title) => title !== null)
  const isPastTop = current !== null && current !== blocks[0]?.key

  const citeIndex = provision ? cites.indexOf(provision) : -1
  const isMissing = provision !== null && targetKeys.size === 0
  const nav = (
    <ReaderNav
      query={query}
      onQueryChange={setQuery}
      results={results}
      words={words}
      outline={reading.outline}
      currentKeys={currentKeys}
      onGo={go}
      searchRef={searchRef}
    />
  )

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Search and contents"
        className="hidden w-72 shrink-0 flex-col border-r px-4 pt-4 @4xl/reader:flex"
      >
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b py-3">
          <div className={cn(measure, "flex items-start justify-between gap-3")}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-lg leading-snug font-semibold text-balance">{reading.title}</h2>
              {reading.edition ? <p className="text-sm text-muted-foreground">{reading.edition}</p> : null}
            </div>
            <div className="-mr-2 flex shrink-0 items-center gap-0.5">
              {canShowOriginal ? (
                <ToggleGroup
                  aria-label="Show"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  className="mr-1"
                  value={[isOriginal ? "original" : "text"]}
                  onValueChange={(values: unknown[]) => {
                    const [next] = values
                    if (next === "text" || next === "original") {
                      switchView(next)
                    }
                  }}
                >
                  <ToggleGroupItem value="text" className="px-2.5 text-xs">
                    Text
                  </ToggleGroupItem>
                  <ToggleGroupItem value="original" className="px-2.5 text-xs">
                    Original
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              <IconAction label="Search and contents" className="@4xl/reader:hidden" onClick={() => setIsNavOpen(true)}>
                <ListIcon />
              </IconAction>
              {/* The Original view shows the file; Download saves it. Neither shows without a stored file. */}
              {canShowOriginal ? (
                <a
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "@max-xl/reader:size-8 @max-xl/reader:px-0"
                  })}
                  href={documentFileUrl(reading.id, { download: true })}
                  download
                >
                  <DownloadIcon aria-hidden />
                  <span className="hidden @xl/reader:inline">Download</span>
                  <span className="sr-only"> {reading.title}</span>
                </a>
              ) : null}
            </div>
          </div>
          {cites.length > 1 && citeIndex >= 0 ? (
            <CiteStepper
              cites={cites}
              index={citeIndex}
              name={(key) => {
                const block = blocks.find((item) => item.type === "provision" && item.provisionKey === key)
                const heading = block?.type === "provision" ? block.heading : stepNames[key]
                return citationTitle({ label: citationLabel(key), heading: heading ?? null })
              }}
              onStep={onStep}
            />
          ) : null}
          {isMissing ? (
            <p className={cn(measure, "pt-2 text-sm text-muted-foreground")}>
              The cited passage isn&rsquo;t in this version of the document.
            </p>
          ) : null}
          {reading.removedAt ? (
            <p className={cn(measure, "pt-2 text-sm text-muted-foreground")}>
              Removed from your governing documents on {dateFormat.format(new Date(reading.removedAt))}. It shows here
              because rules cite it.
            </p>
          ) : null}
          {reading.newerVersionId ? (
            <p className={cn(measure, "pt-2 text-sm text-muted-foreground")}>
              A newer version of this document has been added.{" "}
              <ReaderLink
                href={citationHref(reading.newerVersionId)}
                className="text-link underline-offset-4 hover:underline"
              >
                Read the newer version
              </ReaderLink>
            </p>
          ) : null}
        </header>
        {isOriginal ? (
          <Suspense fallback={<OriginalSkeleton />}>
            <OriginalView
              reading={reading}
              marks={markedRanges(blocks, tones, reading.id)}
              words={words}
              goal={originalGoal}
              onPageChange={setOriginalPage}
            />
          </Suspense>
        ) : null}
        <div ref={scrollRef} hidden={isOriginal} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            aria-hidden
            className={cn(
              "sticky top-0 z-10 h-0 transition-opacity duration-200 motion-reduce:transition-none",
              isPastTop && contextLine.length > 0 ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <p className="truncate border-b bg-background py-2 text-xs text-muted-foreground shadow-xs">
              <span className={cn(measure, "block truncate")}>
                {contextLine.map((title, index) => (
                  <span key={title} className={index === contextLine.length - 1 ? "text-foreground/80" : undefined}>
                    {index > 0 ? <ChevronRightIcon className="mx-1 inline size-3 align-[-2px]" /> : null}
                    {title}
                  </span>
                ))}
              </span>
            </p>
          </div>
          <article
            aria-label={reading.title}
            className={cn(column, "pb-24 text-[0.9375rem] leading-7 @2xl/reader:text-base @2xl/reader:leading-[1.8]")}
          >
            {blocks.length === 0 ? (
              <p className={cn(gutter, "pt-8 text-muted-foreground")}>No text was read from this document.</p>
            ) : null}
            {groups.map((group, groupIndex) => (
              <section
                key={group.key}
                data-group={group.key}
                // Off-screen articles skip layout. Their paint is clipped to the box, so the gutter is inside it, where a
                // marked passage's tint and rule reach.
                className={cn(gutter, "pt-8 [contain-intrinsic-size:auto_40rem] [content-visibility:auto]")}
              >
                {runsOf(group.blocks, tones).map((run) => {
                  const [first] = run.blocks
                  // A marked run starts below its first page marker, so the marker stays a divider in the flow.
                  const leadMarker = run.tone && first ? markers.get(first.key) : undefined
                  const content = run.blocks.map((block) => {
                    const marker = block === first && leadMarker ? undefined : markers.get(block.key)
                    return (
                      <Fragment key={block.key}>
                        {marker ? <PageMarker page={marker} fileTitle={fileTitles.get(marker.fileId)} /> : null}
                        <ReaderBlock
                          block={block}
                          words={matched.has(block.key) ? words : noWords}
                          isFirst={groupIndex === 0 && block === group.blocks[0] && !markers.has(block.key)}
                          onShowOriginal={canShowOriginal ? () => showOriginalAt(block.key) : undefined}
                        />
                      </Fragment>
                    )
                  })
                  return run.tone && first ? (
                    <Fragment key={first.key}>
                      {leadMarker ? (
                        <PageMarker page={leadMarker} fileTitle={fileTitles.get(leadMarker.fileId)} />
                      ) : null}
                      <MarkedRun tone={run.tone} startKey={first.type === "provision" ? first.provisionKey : first.key}>
                        {content}
                      </MarkedRun>
                    </Fragment>
                  ) : (
                    <Fragment key={first?.key}>{content}</Fragment>
                  )
                })}
              </section>
            ))}
          </article>
        </div>
      </div>
      <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
        <SheetContent
          side="left"
          className="w-full gap-0 p-0 data-[side=left]:w-[min(22rem,90vw)]"
          initialFocus={searchRef}
        >
          <SheetHeader className="pr-12">
            <SheetTitle>{reading.title}</SheetTitle>
            <SheetDescription className="sr-only">Search the document or go to a part of it.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4">{nav}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** The block at the top of the reading area, under the context line. */
function currentBlock(container: HTMLElement) {
  const line = container.getBoundingClientRect().top + 48
  const groups = [...container.querySelectorAll<HTMLElement>("[data-group]")]
  // The last group starting above the line; groups are in order, so halve the search.
  let low = 0
  let high = groups.length - 1
  let found = 0
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if ((groups[middle]?.getBoundingClientRect().top ?? 0) <= line) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  const blocksOf = [...(groups[found]?.querySelectorAll<HTMLElement>("[data-block]") ?? [])]
  const block = blocksOf.findLast((element) => element.getBoundingClientRect().top <= line) ?? blocksOf[0]
  return block?.dataset.block ?? null
}

function IconAction({
  label,
  className,
  onClick,
  children
}: {
  label: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className={className} onClick={onClick} />}>
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function CiteStepper({
  cites,
  index,
  name,
  onStep
}: {
  cites: readonly string[]
  index: number
  name: (key: string) => string | null
  onStep: (key: string) => void
}) {
  const previous = cites[index - 1]
  const next = cites[index + 1]
  const currentName = name(cites[index] ?? "")
  return (
    <div className={cn(measure, "flex items-center gap-1 pt-2 text-sm")}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-2"
        disabled={!previous}
        aria-label={previous ? `Previous citation: ${name(previous) ?? previous}` : "Previous citation"}
        onClick={() => previous && onStep(previous)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="shrink-0 tabular-nums" aria-live="polite">
        Citation {index + 1} of {cites.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!next}
        aria-label={next ? `Next citation: ${name(next) ?? next}` : "Next citation"}
        onClick={() => next && onStep(next)}
      >
        <ChevronRightIcon />
      </Button>
      {currentName ? <span className="ml-1 min-w-0 truncate text-muted-foreground">{currentName}</span> : null}
    </div>
  )
}
