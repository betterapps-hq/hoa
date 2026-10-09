import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentFileLinks } from "../DocumentFileLinks/DocumentFileLinks"
import { DocumentViewer, type CitationSource, type ViewerDocument } from "../DocumentViewer/DocumentViewer"

export type DocumentSheetProps = {
  document: ViewerDocument | null
  source: CitationSource
  onClose: () => void
}

/** A governing document to read page by page, in a side sheet, with the original to open or download. */
export function DocumentSheet({ document, source, onClose }: DocumentSheetProps) {
  const [page, setPage] = useState(1)
  return (
    <Sheet
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setPage(1)
        }
      }}
    >
      <SheetContent className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {document ? (
          <>
            <SheetHeader className="gap-1 pr-12">
              <SheetTitle>{document.title}</SheetTitle>
              <SheetDescription>{document.pageCount === 1 ? "1 page" : `${document.pageCount} pages`}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
              <div className="flex justify-end">
                <DocumentFileLinks documentId={document.id} title={document.title} page={page} />
              </div>
              <DocumentViewer
                className="flex-1"
                source={source}
                documentId={document.id}
                page={page}
                onPageChange={setPage}
              />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
