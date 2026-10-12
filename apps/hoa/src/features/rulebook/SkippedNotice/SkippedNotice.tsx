import { TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { countOf } from "../rulebookRecords"

export type SkippedNoticeProps = {
  /** What the build skipped, one line per place and kind (`skippedParts`). */
  parts: SkippedPart[]
  /** Builds the draft again, which redoes only what was skipped; null while a build runs. */
  onRetry: (() => void) | null
  isBusy?: boolean
}

/**
 * What the build that made a draft skipped (encoding.md, UX, Draft review): each place, linked to it in the documents,
 * and a way to try again.
 */
export function SkippedNotice({ parts, onRetry, isBusy = false }: SkippedNoticeProps) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        {countOf(parts.length, "part", "parts")} {parts.length === 1 ? "wasn't" : "weren't"} finished
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Their rules may be missing from the draft.</p>
        <ul className="flex flex-col gap-0.5 text-foreground">
          {parts.map((part) => (
            <li key={part.id}>
              {part.place ? (
                <>
                  <ReaderLink href={part.place.href} className="underline underline-offset-4">
                    {part.place.label}
                  </ReaderLink>
                  : {part.text}
                </>
              ) : (
                part.text
              )}
            </li>
          ))}
        </ul>
        {onRetry ? (
          <Button variant="outline" size="sm" disabled={isBusy} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
