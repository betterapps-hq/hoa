import { useState, type ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationPanel, type CitedProvision } from "../CitationPanel/CitationPanel"
import { citationTitle } from "../CitationPanel/CitationPanel.utils"
import { CitationText } from "../CitationText/CitationText"

export type ProvisionReferenceProps = {
  citation: CitedProvision
  source?: CitationSource
  /** What the link says; the citation's label by default. */
  children?: ReactNode
}

/**
 * A link to a cited provision: hovering or focusing it shows the provision's text, and activating it opens the
 * provision on its document page.
 */
export function ProvisionReference({ citation, source, children }: ProvisionReferenceProps) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <HoverCard>
        <HoverCardTrigger
          delay={300}
          render={
            <button
              type="button"
              className="rounded-sm text-left text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setIsOpen(true)}
            >
              {children ?? citation.label}
            </button>
          }
        />
        <HoverCardContent className="flex max-h-80 w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto">
          <p className="font-medium">{citationTitle(citation)}</p>
          <CitationText citation={citation} />
        </HoverCardContent>
      </HoverCard>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{citationTitle(citation)}</DialogTitle>
            <DialogDescription>{citation.documentTitle}</DialogDescription>
          </DialogHeader>
          <CitationPanel citation={citation} source={source} />
        </DialogContent>
      </Dialog>
    </>
  )
}
