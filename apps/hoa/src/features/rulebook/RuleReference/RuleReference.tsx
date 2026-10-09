import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { CitationPanel, type CitedProvision } from "../CitationPanel/CitationPanel"
import { citationTitle } from "../CitationPanel/CitationPanel.utils"
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
 * hover and focus and opens it on its document page; "and N more" opens every citation.
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
            className="h-auto p-0 text-sm"
            aria-label={`${rule.title}: all ${rule.citations.length} citations`}
            onClick={() => setIsAllOpen(true)}
          >
            and {more.length} more
          </Button>
          <Dialog open={isAllOpen} onOpenChange={setIsAllOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{rule.title}</DialogTitle>
                <DialogDescription>{rule.citations.length} citations, the main one first</DialogDescription>
              </DialogHeader>
              {rule.citations.map((citation) => (
                <section key={citation.provisionKey} className="flex flex-col gap-2">
                  <h3 className="font-medium">{citationTitle(citation)}</h3>
                  <CitationPanel citation={citation} source={source} />
                </section>
              ))}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </span>
  )
}
