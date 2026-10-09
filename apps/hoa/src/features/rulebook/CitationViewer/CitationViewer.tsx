import { useState } from "react"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentFileLinks } from "@/features/documents/DocumentFileLinks/DocumentFileLinks"
import { DocumentViewer, type CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationText } from "../CitationText/CitationText"
import { citationTitle } from "./CitationViewer.utils"

/** A cited provision as screens show it; the text is always the stored provision, so it can't drift from the document. */
export type CitedProvision = {
  provisionKey: string
  /** "Declaration 4.3(b)" */
  label: string
  documentTitle: string
  heading: string | null
  /** The ancestors' lead-ins that govern it, outermost first. */
  intros: string[]
  text: string
  /** The ancestors' wrap-ups that finish it, nearest first. */
  wrapUps: string[]
  /** The operative words within `text`; null means all of it. */
  highlight: { start: number; end: number } | null
  /** Where the provision is on its file's pages. */
  anchors: { fileId: string; page: number; start: number; end: number }[]
}

export type CitationViewerProps = {
  /** The citations it can show, such as all of a rule's; it opens at the first. */
  citations: CitedProvision[]
  source?: CitationSource
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

/**
 * Where every citation opens (encoding.md, UX): the governing document itself, at the cited page with the provision
 * highlighted, in a side sheet that takes the whole width of a phone. With several citations, a picker switches
 * between them. Without the document's pages, it shows the provision as stored.
 */
export function CitationViewer({ citations, source, isOpen, onOpenChange }: CitationViewerProps) {
  const [index, setIndex] = useState(0)
  const citation = citations[Math.min(index, citations.length - 1)]
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          setIndex(0)
        }
      }}
    >
      <SheetContent className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {citation ? (
          <>
            <SheetHeader className="gap-1 pr-12">
              <SheetTitle className="leading-snug">{citationTitle(citation)}</SheetTitle>
              <SheetDescription>{citation.documentTitle}</SheetDescription>
            </SheetHeader>
            {citations.length > 1 ? (
              <div className="px-4 pb-2">
                <NativeSelect
                  size="sm"
                  aria-label="Citation"
                  className="w-full sm:w-auto"
                  value={String(index)}
                  onChange={(event) => setIndex(Number(event.target.value))}
                >
                  {citations.map((item, position) => (
                    <NativeSelectOption key={item.provisionKey} value={String(position)}>
                      {position === 0 ? `${citationTitle(item)} (main)` : citationTitle(item)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            <CitedPage key={citation.provisionKey} citation={citation} source={source} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function CitedPage({ citation, source }: { citation: CitedProvision; source?: CitationSource }) {
  const [first] = citation.anchors
  const file = first ? source?.documents.find((document) => document.id === first.fileId) : undefined
  const [page, setPage] = useState(first?.page ?? 1)
  if (!first || !file || !source) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
        <p className="text-sm text-muted-foreground">
          The document&rsquo;s pages aren&rsquo;t available here, so this is the provision as stored.
        </p>
        <CitationText citation={citation} />
      </div>
    )
  }
  const pages = [
    ...new Set(citation.anchors.filter((anchor) => anchor.fileId === file.id).map((anchor) => anchor.page))
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {pages.length > 1 ? (
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            Highlighted on pages
            {pages.map((item) => (
              <Button
                key={item}
                size="xs"
                variant={item === page ? "secondary" : "ghost"}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => setPage(item)}
              >
                {item}
              </Button>
            ))}
          </p>
        ) : (
          <span />
        )}
        <DocumentFileLinks documentId={file.id} title={file.title} page={page} />
      </div>
      <DocumentViewer
        className="flex-1"
        source={source}
        documentId={file.id}
        page={page}
        onPageChange={setPage}
        highlights={citation.anchors.map((anchor) => ({
          documentId: anchor.fileId,
          pageIndex: anchor.page,
          range: { start: anchor.start, end: anchor.end }
        }))}
      />
    </div>
  )
}
