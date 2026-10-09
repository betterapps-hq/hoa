import { DocumentViewer, type CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationText } from "../CitationText/CitationText"

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

export type CitationPanelProps = {
  citation: CitedProvision
  /** The uploads with pages; with the provision's file among them, the panel shows it on its page. */
  source?: CitationSource
}

/** One citation: the provision's text, and its document page with the provision highlighted. The container names it. */
export function CitationPanel({ citation, source }: CitationPanelProps) {
  const [first] = citation.anchors
  const isViewable = first !== undefined && source?.documents.some((document) => document.id === first.fileId)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CitationText citation={citation} />
      {isViewable && source ? (
        <DocumentViewer
          source={source}
          initial={{ documentId: first.fileId, pageIndex: first.page }}
          highlights={citation.anchors.map((anchor) => ({
            documentId: anchor.fileId,
            pageIndex: anchor.page,
            quote: "",
            range: { start: anchor.start, end: anchor.end }
          }))}
        />
      ) : (
        <p className="text-muted-foreground">
          The document’s pages aren’t available, so this is the provision as stored.
        </p>
      )}
    </div>
  )
}
