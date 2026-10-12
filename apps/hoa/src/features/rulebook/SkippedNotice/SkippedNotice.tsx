import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { JobFailure } from "@/jobs/job"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { countOf } from "../rulebookRecords"

export type SkippedNoticeProps = {
  /** Everything the build skipped, one per item. */
  failures: JobFailure[]
  /** The same, one line per place and kind (`skippedParts`). */
  parts: SkippedPart[]
}

/**
 * What the build that made a draft skipped (encoding.md, UX, Draft review): where, in words, with the errors behind it
 * folded away.
 */
export function SkippedNotice({ failures, parts }: SkippedNoticeProps) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>The build skipped {countOf(failures.length, "item", "items")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>What they cover may be missing from the draft. Check those parts of the documents before you publish.</p>
        <ul className="flex flex-col gap-0.5 text-foreground">
          {parts.map((part) => (
            <li key={part.id}>{part.text}</li>
          ))}
        </ul>
        <Collapsible>
          <CollapsibleTrigger
            render={<Button variant="link" size="sm" className="group/details h-auto p-0 text-muted-foreground" />}
          >
            What went wrong
            <ChevronDownIcon aria-hidden className="transition-transform group-aria-expanded/details:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex flex-col gap-1 text-xs break-words">
              {parts.flatMap((part) =>
                part.details.map((detail, index) => <li key={`${part.id} ${index}`}>{detail}</li>)
              )}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}
