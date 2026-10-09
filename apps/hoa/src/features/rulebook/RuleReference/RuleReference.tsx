import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationViewer, type CitedProvision } from "../CitationViewer/CitationViewer"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"

/** A rule as every screen names it: its title and its citations, the main one first. */
export type ReferencedRule = { key: string; title: string; citations: CitedProvision[] }

export type RuleReferenceProps = {
  rule: ReferencedRule
  /** The uploads with pages, for showing a citation on its page. */
  source?: CitationSource
  /** Replaces the title, such as with a button that opens the rule; null leaves it out. */
  title?: ReactNode
}

/**
 * A rule's title and its main citation's label (application-review.md, UX). The label shows the provision's text on
 * hover and focus and opens the document at it; "and N more" opens the citation viewer with every citation.
 */
export function RuleReference({ rule, source, title }: RuleReferenceProps) {
  const [isAllOpen, setIsAllOpen] = useState(false)
  const [main, ...more] = rule.citations
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {title === undefined ? <span className="font-medium">{rule.title}</span> : title}
      {main ? (
        <ProvisionReference citation={main} source={source} />
      ) : (
        <span className="text-muted-foreground">No citation</span>
      )}
      {more.length > 0 ? (
        <>
          <Button
            variant="link"
            className="h-auto p-0 text-sm text-link"
            aria-label={`${rule.title}: all ${rule.citations.length} citations`}
            onClick={() => setIsAllOpen(true)}
          >
            and {more.length} more
          </Button>
          <CitationViewer citations={rule.citations} source={source} isOpen={isAllOpen} onOpenChange={setIsAllOpen} />
        </>
      ) : null}
    </span>
  )
}
