import { TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import { StepList } from "../DocumentEncodingSteps/DocumentEncodingSteps"
import { startingSteps, stepLabelOf } from "../DocumentEncodingSteps/DocumentEncodingSteps.utils"
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
 * What the build that made a draft skipped (encoding.md, UX, Draft review): the same steps the progress showed, done,
 * with a warning on each that left something undone and, under it, each place linked to it in the documents; and a
 * way to try again.
 */
export function SkippedNotice({ parts, onRetry, isBusy = false }: SkippedNoticeProps) {
  const steps = startingSteps().map((step) => ({ ...step, status: "done" as const }))
  const problems = new Map(
    steps.flatMap((step) => {
      const own = parts.filter((part) => stepLabelOf(part.stage) === step.label)
      return own.length > 0 ? [[step.label, <SkippedPlaces key={step.label} parts={own} />] as const] : []
    })
  )
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        {countOf(parts.length, "part", "parts")} {parts.length === 1 ? "wasn't" : "weren't"} finished
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Their rules may be missing from the draft.</p>
        <div className="text-foreground">
          <StepList steps={steps} problems={problems} />
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" disabled={isBusy} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

function SkippedPlaces({ parts }: { parts: SkippedPart[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-muted-foreground">
      {parts.map((part) => (
        <li key={part.id}>
          {part.place ? (
            <>
              <ReaderLink href={part.place.href} className="text-foreground underline underline-offset-4">
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
  )
}
