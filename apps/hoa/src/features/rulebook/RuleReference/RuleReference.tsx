import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import type { CitedProvision } from "../citedProvision"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { CitationPicker } from "./CitationPicker"

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
 * hover and focus and opens the document at it; "and N more" opens a picker of every citation, each linking to the
 * document reader at its passage.
 */
export function RuleReference({ rule, source, title }: RuleReferenceProps) {
  const [main, ...more] = rule.citations
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {title === undefined ? <span className="font-medium">{rule.title}</span> : title}
      {main ? (
        <ProvisionReference
          citation={main}
          source={source}
          cites={rule.citations.map((citation) => citation.provisionKey)}
        />
      ) : (
        <span className="text-muted-foreground">No citation</span>
      )}
      {more.length > 0 ? (
        <CitationPicker
          citations={rule.citations}
          title={`${rule.title}: citations`}
          trigger={
            <Button
              variant="link"
              className="h-auto p-0 text-sm text-link"
              aria-label={`${rule.title}: all ${rule.citations.length} citations`}
            >
              and {more.length} more
            </Button>
          }
        />
      ) : null}
    </span>
  )
}
