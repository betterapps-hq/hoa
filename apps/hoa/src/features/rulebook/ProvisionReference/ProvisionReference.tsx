import { useState, type ReactNode } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationText } from "../CitationText/CitationText"
import { CitationViewer, type CitedProvision } from "../CitationViewer/CitationViewer"
import { citationTitle } from "../CitationViewer/CitationViewer.utils"

export type ProvisionReferenceProps = {
  citation: CitedProvision
  source?: CitationSource
  /** What the link says; the citation's label by default. */
  children?: ReactNode
}

/**
 * A link to a cited provision: hovering or focusing it shows the provision's text, and activating it opens the
 * document at the provision, highlighted, in the citation viewer.
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
              className="rounded-sm text-left text-link underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      <CitationViewer citations={[citation]} source={source} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  )
}
