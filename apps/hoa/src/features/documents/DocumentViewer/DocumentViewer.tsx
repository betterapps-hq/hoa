import { useTextSelection } from "@mantine/hooks"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon, HighlighterIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import type { DocumentPage } from "../documents.functions"
import { highlightRanges, rehypeSourceOffsets, selectionRange, type PageHighlight } from "./DocumentViewer.utils"

export type ViewerDocument = { id: string; title: string; pageCount: number }

export type CitationSource = {
  documents: ViewerDocument[]
  loadPage: (documentId: string, pageIndex: number) => Promise<DocumentPage>
}

export type PageSelectionInput = { documentId: string; pageIndex: number; start: number; end: number }

export type DocumentViewerProps = {
  source: CitationSource
  /** Where the viewer opens. */
  initial: { documentId: string; pageIndex: number }
  /** Passages to highlight, such as a rule's citations. */
  highlights?: PageHighlight[]
  /** With this, the reader can select a passage and cite it; the range, not the text, is sent. */
  onCite?: (selection: PageSelectionInput) => Promise<void>
}

/** Shows a governing document page by page, highlights cited passages, and lets an administrator cite a selection. */
export function DocumentViewer({ source, initial, highlights = [], onCite }: DocumentViewerProps) {
  const [documentId, setDocumentId] = useState(initial.documentId)
  const [pageIndex, setPageIndex] = useState(initial.pageIndex)
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null)
  const [isCiting, setIsCiting] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const document = source.documents.find((item) => item.id === documentId)
  const pageCount = document?.pageCount ?? 1
  const {
    data: page,
    isPending,
    error
  } = useQuery({
    queryKey: ["document-page", documentId, pageIndex],
    queryFn: () => source.loadPage(documentId, pageIndex)
  })

  const goTo = (next: number) => {
    setSelection(null)
    setPageIndex(Math.min(Math.max(1, next), pageCount))
  }

  // Follow the reader's selection, by mouse or keyboard. A passage chosen on this page stays chosen when the selection
  // moves elsewhere, such as onto the Add button, until another passage is selected or the page changes.
  const textSelection = useTextSelection()
  const selectedText = textSelection?.toString() ?? ""
  useEffect(() => {
    const container = textRef.current
    if (!onCite || !container || !textSelection || textSelection.rangeCount === 0) {
      return
    }
    const range = selectionRange(container, textSelection.getRangeAt(0))
    if (range) {
      setSelection({ ...range, text: selectedText })
    }
  }, [onCite, textSelection, selectedText, page])
  const cite = async () => {
    if (!onCite || !selection) {
      return
    }
    setIsCiting(true)
    try {
      await onCite({ documentId, pageIndex, start: selection.start, end: selection.end })
      setSelection(null)
    } finally {
      setIsCiting(false)
    }
  }

  const pageHighlights = highlights.filter((item) => item.documentId === documentId && item.pageIndex === pageIndex)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {source.documents.length > 1 ? (
          <NativeSelect
            aria-label="Document"
            value={documentId}
            onChange={(event) => {
              setDocumentId(event.target.value)
              setSelection(null)
              setPageIndex(1)
            }}
          >
            {source.documents.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <span className="text-sm font-medium">{document?.title}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Previous page"
            disabled={pageIndex <= 1}
            onClick={() => goTo(pageIndex - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-28 text-center text-sm text-muted-foreground" aria-live="polite">
            Page {pageIndex} of {pageCount}
            {page?.pageLabel ? ` (printed ${page.pageLabel})` : ""}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Next page"
            disabled={pageIndex >= pageCount}
            onClick={() => goTo(pageIndex + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {onCite ? (
        <p className="text-sm text-muted-foreground">
          Select the passage that states the rule, then add it. The citation is the document’s own text.
        </p>
      ) : null}

      <div className="min-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-4" style={{ maxHeight: "55vh" }}>
        {isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading the page
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {page ? (
          <div
            ref={textRef}
            className="document-page text-sm leading-relaxed selection:bg-amber-200 dark:selection:bg-amber-700"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSourceOffsets(highlightRanges(page.text, pageHighlights))]}
            >
              {page.text}
            </ReactMarkdown>
          </div>
        ) : null}
      </div>

      {onCite ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!selection || isCiting} onClick={() => void cite()}>
            <HighlighterIcon />
            {isCiting ? "Adding" : "Add as citation"}
          </Button>
          <span className="line-clamp-2 flex-1 text-sm text-muted-foreground">
            {selection ? `“${selection.text.trim()}”` : "Nothing selected."}
          </span>
        </div>
      ) : null}
    </div>
  )
}
