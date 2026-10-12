import type { ReactNode } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { citedProvisionHref } from "@/features/documents/citationLink"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import { CitationText } from "../CitationText/CitationText"
import { citationTitle, type CitedProvision } from "../citedProvision"

export type ProvisionReferenceProps = {
  citation: CitedProvision
  /** Unused since citations open in the document reader; kept while callers still pass it. */
  source?: CitationSource
  /** The provision keys of every citation it's one of, in order, so the reader steps through them. */
  cites?: readonly string[]
  /** What the link says; the citation's label by default. */
  children?: ReactNode
}

/**
 * A link to a cited provision: hovering or focusing it shows the provision's text, and following it opens the document
 * reader at the provision, highlighted (a real link, so it opens in a new tab too).
 */
export function ProvisionReference({ citation, cites, children }: ProvisionReferenceProps) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={300}
        render={
          <ReaderLink
            href={citedProvisionHref(citation, cites)}
            className="rounded-sm text-left text-link underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {children ?? citation.label}
          </ReaderLink>
        }
      />
      <HoverCardContent className="flex max-h-80 w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto">
        <p className="font-medium">{citationTitle(citation)}</p>
        <CitationText citation={citation} />
      </HoverCardContent>
    </HoverCard>
  )
}
