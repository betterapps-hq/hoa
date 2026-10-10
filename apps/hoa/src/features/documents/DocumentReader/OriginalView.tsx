import { useElementSize, useMergedRef, useReducedMotion } from "@mantine/hooks"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileWarningIcon, MinusIcon, PlusIcon } from "lucide-react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useEffect, useRef, useState, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fromTuples, rangeRects, type PageGeometry } from "@/documents/pageGeometry"
import type { DocumentReading } from "@/documents/reading"
import { cn } from "@/lib/utils"
import { documentFileUrl } from "../documentFile"
import { getPageGeometry } from "../documents.functions"
import { pageName } from "./DocumentReader.utils"
import { pageMarks, type MarkedRange, type PageMark } from "./originalMarks"

// The uploaded PDF itself, page under page (encoding.md, UX, Reading), drawn with pdf.js, which loads only with this
// view. Pages render as they come near the screen and let go of their canvas when they're far. Passages are marked
// over their words from the OCR's word boxes, in a layer that scales with the page, and pdf.js's text layer makes the
// text selectable.

/** Where the view should go: a page, and the range on it to bring into view; `request` changes to go again. */
export type OriginalGoal = {
  page: number
  start: number | null
  end: number | null
  request: number
  isSmooth: boolean
}

export type OriginalViewProps = {
  reading: DocumentReading
  /** The marked ranges on each page of this upload. */
  marks: ReadonlyMap<number, readonly MarkedRange[]>
  /** The search's words, marked wherever a word starts with one. */
  words: readonly string[]
  goal: OriginalGoal | null
  onPageChange: (page: number) => void
}

/** Pages ask for word boxes ten at a time. */
const batchSize = 10
const batchOf = (page: number) => Math.floor((page - 1) / batchSize) * batchSize + 1

const geometryQuery = (documentId: string, page: number) => {
  const from = batchOf(page)
  return {
    queryKey: ["page-geometry", documentId, from],
    queryFn: async () =>
      (await getPageGeometry({ data: { documentId, from, to: from + batchSize - 1 } })).map((item): PageGeometry => ({
        ...item,
        words: fromTuples(item.words)
      })),
    staleTime: Number.POSITIVE_INFINITY
  }
}

const zoomSteps = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]
/** A page at fit width never grows past this, so a wide screen doesn't blow the page up. */
const widestPage = 1100
const openAt = 0.22

type Pdf = { pdf: PDFDocumentProxy; aspect: number; pdfjs: typeof import("pdfjs-dist") }

async function loadPdf(url: string): Promise<Pdf> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // Ranges, not the whole file: the pages near the screen load first.
  const pdf = await pdfjs.getDocument({ url, rangeChunkSize: 1024 * 1024, disableAutoFetch: true, disableStream: true })
    .promise
  const first = await pdf.getPage(1)
  const viewport = first.getViewport({ scale: 1 })
  return { pdf, aspect: viewport.height / viewport.width, pdfjs }
}

export default function OriginalView({ reading, marks, words, goal, onPageChange }: OriginalViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // The scroller's own content width, inside its scrollbar, so a page at fit width never scrolls sideways.
  const { ref: sizeRef, width: containerWidth } = useElementSize<HTMLDivElement>()
  const scrollerRef = useMergedRef(scrollRef, sizeRef)
  const queryClient = useQueryClient()
  const isReducedMotion = useReducedMotion() === true
  const [zoom, setZoom] = useState(1)
  const pdf = useQuery({
    queryKey: ["original-pdf", reading.id],
    queryFn: () => loadPdf(documentFileUrl(reading.id)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60 * 1000,
    retry: 1
  })
  const pageCount = pdf.data?.pdf.numPages ?? reading.pageCount
  const fitWidth = Math.max(240, Math.min(containerWidth - 32, widestPage))
  const pageWidth = Math.round(fitWidth * zoom)
  const aspect = pdf.data?.aspect ?? 11 / 8.5

  // Go where asked: the page at once, then the marked range on it once its word boxes are in.
  useEffect(() => {
    const container = scrollRef.current
    if (!goal || !container || !pdf.data || containerWidth === 0) {
      return
    }
    const pageElement = container.querySelector<HTMLElement>(`[data-original-page="${goal.page}"]`)
    if (!pageElement) {
      return
    }
    const topOf = (element: HTMLElement) =>
      element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    const behavior = goal.isSmooth && !isReducedMotion ? "smooth" : "auto"
    let isCurrent = true
    const go = (offset: number) => {
      container.scrollTo({ top: Math.max(0, topOf(pageElement) + offset - container.clientHeight * openAt), behavior })
    }
    go(0)
    pageElement.focus({ preventScroll: true })
    const { start, end } = goal
    if (start !== null && end !== null && reading.original?.hasWordBoxes) {
      void queryClient.fetchQuery(geometryQuery(reading.id, goal.page)).then((pages) => {
        const geometry = pages.find((item) => item.page === goal.page)
        const [first] = geometry ? rangeRects(geometry, start, end) : []
        if (isCurrent && geometry && first) {
          go((first.y / geometry.height) * pageElement.getBoundingClientRect().height)
        }
      })
    }
    return () => {
      isCurrent = false
    }
    // Only a new goal (or the first layout) moves the view; zooming keeps the place by itself.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.request, pdf.data, containerWidth === 0])

  // Follow the page at the top third, for keeping the place and "Open the original".
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !pdf.data) {
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const line = container.getBoundingClientRect().top + container.clientHeight * openAt
      const pages = [...container.querySelectorAll<HTMLElement>("[data-original-page]")]
      const current = pages.findLast((element) => element.getBoundingClientRect().top <= line) ?? pages[0]
      if (current) {
        onPageChange(Number(current.dataset.originalPage))
      }
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update)
      }
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [pdf.data, onPageChange])

  const labels = new Map(
    reading.pages.filter((page) => page.fileId === reading.id).map((page) => [page.page, page] as const)
  )
  const zoomIndex = zoomSteps.indexOf(zoom)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <section
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/40 dark:bg-muted/20"
        aria-label={`${reading.title}, as uploaded`}
      >
        {pdf.error ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileWarningIcon />
              </EmptyMedia>
              <EmptyTitle>The original can&rsquo;t be shown</EmptyTitle>
              <EmptyDescription>
                Its file didn&rsquo;t open here. The text view still has the whole document, and the file can be
                downloaded.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex w-max min-w-full flex-col items-center gap-6 px-4 py-6">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
              <OriginalPage
                key={page}
                page={page}
                pdf={pdf.data}
                width={pageWidth}
                aspect={aspect}
                documentId={reading.id}
                hasWordBoxes={reading.original?.hasWordBoxes === true}
                name={pageName(labels.get(page) ?? { fileId: reading.id, page, label: null })}
                ranges={marks.get(page)}
                words={words}
                scrollRef={scrollRef}
              />
            ))}
          </div>
        )}
      </section>
      {pdf.data ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/95 p-1 shadow-sm backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Zoom out"
              disabled={zoomIndex <= 0}
              onClick={() => setZoom(zoomSteps[zoomIndex - 1] ?? zoom)}
            >
              <MinusIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-16 rounded-full tabular-nums"
              aria-label={zoom === 1 ? "Fit to width" : `${Math.round(zoom * 100)} percent, fit to width`}
              onClick={() => setZoom(1)}
            >
              {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Zoom in"
              disabled={zoomIndex >= zoomSteps.length - 1}
              onClick={() => setZoom(zoomSteps[zoomIndex + 1] ?? zoom)}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const markClass: Record<PageMark["tone"], string> = {
  // A tint and an outline, so a mark reads without color; multiplied, so the print stays black through it.
  target: "bg-amber-300/40 outline-2 outline-amber-600/80 mix-blend-multiply",
  related: "bg-sky-200/40 outline-1 outline-sky-700/50 mix-blend-multiply",
  match: "bg-yellow-300/60 outline-1 outline-yellow-700/60 mix-blend-multiply"
}

type OriginalPageProps = {
  page: number
  pdf: Pdf | undefined
  width: number
  aspect: number
  documentId: string
  hasWordBoxes: boolean
  name: string
  ranges: readonly MarkedRange[] | undefined
  words: readonly string[]
  scrollRef: RefObject<HTMLDivElement | null>
}

/** One page: a placeholder of its size until it comes near, then its canvas, text layer and marks. */
function OriginalPage({
  page,
  pdf,
  width,
  aspect,
  documentId,
  hasWordBoxes,
  name,
  ranges,
  words,
  scrollRef
}: OriginalPageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const [isNear, setIsNear] = useState(false)
  const [ownAspect, setOwnAspect] = useState<number | null>(null)
  const height = Math.round(width * (ownAspect ?? aspect))

  useEffect(() => {
    const element = pageRef.current
    if (!element) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry?.isIntersecting === true), {
      root: scrollRef.current,
      rootMargin: "150% 0px"
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [scrollRef])

  const geometry = useQuery({
    ...geometryQuery(documentId, page),
    enabled: isNear && hasWordBoxes && ((ranges?.length ?? 0) > 0 || words.length > 0),
    select: (pages) => pages.find((item) => item.page === page) ?? null
  })
  const marks = geometry.data ? pageMarks(geometry.data, ranges ?? [], words) : []

  return (
    <section className="flex flex-col items-start gap-1.5" aria-label={name}>
      <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
        {name}
      </span>
      <div
        ref={pageRef}
        data-original-page={page}
        tabIndex={-1}
        className="relative overflow-hidden rounded-[2px] bg-white shadow-sm ring-1 ring-black/5 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-white/10"
        style={{ width, height }}
      >
        {isNear && pdf ? (
          <RenderedPage pdf={pdf} page={page} width={width} onAspect={setOwnAspect} />
        ) : (
          <Skeleton className="absolute inset-0 rounded-none bg-neutral-100" />
        )}
        {geometry.data && marks.length > 0 ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {marks.map((mark, index) => (
              <span
                // Marks never reorder within a render; their position is their identity.
                key={index}
                className={cn("absolute rounded-[2px] outline", markClass[mark.tone])}
                style={{
                  left: `${((mark.x - 0.02) / (geometry.data?.width ?? 1)) * 100}%`,
                  top: `${((mark.y - 0.02) / (geometry.data?.height ?? 1)) * 100}%`,
                  width: `${((mark.width + 0.04) / (geometry.data?.width ?? 1)) * 100}%`,
                  height: `${((mark.height + 0.04) / (geometry.data?.height ?? 1)) * 100}%`
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** A page's canvas and text layer at a width, redrawn when the width changes and released when it unmounts. */
function RenderedPage({
  pdf,
  page,
  width,
  onAspect
}: {
  pdf: Pdf
  page: number
  width: number
  onAspect: (aspect: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [isDrawn, setIsDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const text = textRef.current
    if (!canvas || !text) {
      return
    }
    let isCurrent = true
    const cleanups: (() => void)[] = []
    void (async () => {
      const proxy = await pdf.pdf.getPage(page)
      if (!isCurrent) {
        return
      }
      const base = proxy.getViewport({ scale: 1 })
      onAspect(base.height / base.width)
      const scale = width / base.width
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = proxy.getViewport({ scale: scale * ratio })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const render = proxy.render({ canvas, viewport })
      cleanups.push(() => render.cancel())
      text.replaceChildren()
      text.style.setProperty("--total-scale-factor", String(scale))
      const layer = new pdf.pdfjs.TextLayer({
        textContentSource: proxy.streamTextContent(),
        container: text,
        viewport: proxy.getViewport({ scale })
      })
      cleanups.push(() => layer.cancel())
      try {
        await Promise.all([render.promise, layer.render()])
        if (isCurrent) {
          setIsDrawn(true)
        }
      } catch {
        // Cancelled by a newer drawing or by leaving the screen.
      }
    })()
    return () => {
      isCurrent = false
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [pdf, page, width, onAspect])

  return (
    <>
      {isDrawn ? null : <Skeleton className="absolute inset-0 rounded-none bg-neutral-100" />}
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <div ref={textRef} className="textLayer" />
    </>
  )
}
