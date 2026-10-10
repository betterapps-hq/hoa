import { useUncontrolled } from "@mantine/hooks"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { DocumentPage } from "../documents.functions"
import { highlightRanges, rehypeHighlights, type PageHighlight } from "./DocumentViewer.utils"

export type ViewerDocument = { id: string; title: string; pageCount: number }

/** The uploads citations point into, and how to read one page of each. */
export type CitationSource = {
  documents: ViewerDocument[]
  loadPage: (documentId: string, pageIndex: number) => Promise<DocumentPage>
}

export type DocumentViewerProps = {
  source: CitationSource
  documentId: string
  /** The page shown, when the parent controls it with `onPageChange`. */
  page?: number
  /** The page it opens at, when it controls its own page. */
  defaultPage?: number
  onPageChange?: (page: number) => void
  /** Passages to highlight, on any page; each page shows its own. */
  highlights?: PageHighlight[]
  /** The chosen highlight, outlined and scrolled into view. */
  selectedId?: string | null
  /** With this, clicking a highlight that has an id chooses it. */
  onSelect?: (id: string) => void
  className?: string
}

/**
 * A governing document page by page, as it was read from the upload, with passages highlighted: the place every
 * citation opens. It fills its container's height and scrolls the page inside it.
 */
export function DocumentViewer({
  source,
  documentId,
  page: pageProp,
  defaultPage,
  onPageChange,
  highlights = [],
  selectedId = null,
  onSelect,
  className
}: DocumentViewerProps) {
  const [pageIndex, setPageIndex] = useUncontrolled({
    value: pageProp,
    defaultValue: defaultPage,
    finalValue: 1,
    onChange: onPageChange
  })
  const scrollRef = useRef<HTMLElement>(null)
  const document = source.documents.find((item) => item.id === documentId)
  const pageCount = document?.pageCount ?? 1
  const {
    data: page,
    isPending,
    error
  } = useQuery({
    queryKey: ["document-page", documentId, pageIndex],
    queryFn: () => source.loadPage(documentId, pageIndex),
    staleTime: Number.POSITIVE_INFINITY
  })
  const pageHighlights = highlights.filter((item) => item.documentId === documentId && item.pageIndex === pageIndex)
  const isChoosable = onSelect !== undefined

  // Open at the passage: the chosen highlight, or a citation's first; a page of choosable passages opens at its top.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !page) {
      return
    }
    if (selectedId) {
      container.querySelector(`[data-highlight="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "center" })
      return
    }
    const first = isChoosable ? null : container.querySelector("mark")
    if (first) {
      first.scrollIntoView({ block: "center" })
    } else {
      container.scrollTop = 0
    }
  }, [page, selectedId, isChoosable])

  const goTo = (next: number) => setPageIndex(Math.min(Math.max(1, next), pageCount))

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Previous page"
          disabled={pageIndex <= 1}
          onClick={() => goTo(pageIndex - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="text-center text-sm text-muted-foreground" aria-live="polite">
          Page {pageIndex} of {pageCount}
          {page?.pageLabel && page.pageLabel !== String(pageIndex) ? `, printed ${page.pageLabel}` : ""}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next page"
          disabled={pageIndex >= pageCount}
          onClick={() => goTo(pageIndex + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <section
        ref={scrollRef}
        aria-label={`${document?.title ?? "Document"}, page ${pageIndex}`}
        // The page scrolls with the keyboard too.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto rounded-md border-t focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="min-h-full px-2 py-4">
          {isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading the page
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
          {page ? (
            // Marks are chosen with a click here; the coverage view lists the same passages as buttons for the keyboard.
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className={cn(
                "document-page text-[0.9375rem] leading-7 break-words",
                isChoosable && "[&_mark[data-highlight]]:cursor-pointer"
              )}
              onClick={(event) => {
                const id =
                  event.target instanceof Element
                    ? event.target.closest<HTMLElement>("mark[data-highlight]")?.dataset.highlight
                    : undefined
                if (id && onSelect && window.getSelection()?.isCollapsed !== false) {
                  onSelect(id)
                }
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlights(highlightRanges(pageHighlights), selectedId)]}
              >
                {page.text}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
