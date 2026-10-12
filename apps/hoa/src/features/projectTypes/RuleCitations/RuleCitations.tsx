import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { ProvisionReference } from "../../rulebook/ProvisionReference/ProvisionReference"
import { CitationPicker } from "../../rulebook/RuleReference/CitationPicker"

// The passages a question or a document cites, as one quiet line: the first few, each showing its text on hover and
// opening the document at it, and "and N more" for the rest in the citation picker. A link to a passage the rulebook no
// longer has is flagged quietly, for the administrator to fix.

export type RuleCitationsProps = {
  citations: readonly CitedProvision[]
  /** How many linked passages the rulebook no longer has. */
  missing?: number
  /** How many citations show before "and N more". */
  shown?: number
}

export function RuleCitations({ citations, missing = 0, shown = 2 }: RuleCitationsProps) {
  const unique = [...new Map(citations.map((citation) => [citation.provisionKey, citation])).values()]
  if (unique.length === 0 && missing === 0) {
    return null
  }
  const first = unique.slice(0, shown)
  const more = unique.length - first.length
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {unique.length > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span>Cites</span>
          {first.map((citation, index) => (
            <span key={citation.provisionKey}>
              <ProvisionReference citation={citation} />
              {index < first.length - 1 ? "," : null}
            </span>
          ))}
          {more > 0 ? (
            <CitationPicker
              citations={unique}
              title="Citations"
              trigger={
                <Button type="button" variant="link" className="h-auto p-0 text-sm text-link">
                  and {more} more
                </Button>
              }
            />
          ) : null}
        </p>
      ) : null}
      {missing > 0 ? (
        <p className="flex items-center gap-1.5">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
          {missing === 1
            ? "A cited passage is no longer in the rulebook. Edit the question to fix it."
            : `${missing} cited passages are no longer in the rulebook. Edit the question to fix them.`}
        </p>
      ) : null}
    </div>
  )
}
