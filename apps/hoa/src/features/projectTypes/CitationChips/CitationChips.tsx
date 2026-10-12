import { TriangleAlertIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { citedProvisionHref } from "@/features/documents/citationLink"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import type { CitedProvision } from "../../rulebook/citedProvision"

// The passages a question or a document requirement cites, as compact chips in its edit dialog: each label a citation
// link that opens the document reader (in a sheet over the editor, CitationsOpenInSheet; a new tab on a middle-click),
// and a separate button that removes it. A passage the rulebook no longer has is flagged and can only be removed.

export type CitationChipsProps = {
  /** The cited provisions, by key, in order. */
  keys: readonly string[]
  /** The passages the rulebook has, by provision key. */
  known: ReadonlyMap<string, CitedProvision>
  onRemove: (key: string) => void
}

export function CitationChips({ keys, known, onRemove }: CitationChipsProps) {
  const cites = keys.filter((key) => known.has(key))
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Linked citations">
      {keys.map((key) => {
        const citation = known.get(key)
        const label = citation?.label ?? "Missing passage"
        return (
          <li key={key} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-sm">
            {citation ? (
              <ReaderLink
                href={citedProvisionHref(citation, cites)}
                title={citation.heading ?? undefined}
                className="rounded-sm text-link underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {label}
              </ReaderLink>
            ) : (
              <>
                <TriangleAlertIcon className="size-3.5 text-destructive" aria-hidden />
                <span title="No longer in the rulebook">{label}</span>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${label}`}
              onClick={() => onRemove(key)}
            >
              <XIcon />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
