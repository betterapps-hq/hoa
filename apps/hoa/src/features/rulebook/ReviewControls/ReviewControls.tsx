import { CheckIcon, PencilIcon, RotateCcwIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RecordRef } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { reviewRecord } from "../attempt"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type ReviewControlsProps = {
  /** The record reviewed. */
  record: RecordRef
  status: T.Review["status"]
  /** What it's called in the accessible names of compact controls: "Owner". */
  name?: string
  /** Why it can't be approved yet; Approve waits until there's nothing. */
  blockers?: string[]
  /** With this, Edit is offered. */
  onEdit?: () => void
  /** Compact controls for a row in a list: smaller buttons, and the blockers left to the record's own view. */
  isCompact?: boolean
  className?: string
}

/**
 * The review of one record (encoding.md, UX): Approve, then Reject and Edit as quieter actions. A decided record says
 * so in words, with Undo to send it back to review. Rejecting is how a record is dropped: it stays in the draft with
 * its status, and a rebuild carries the decision forward. The settings can't be dropped, so they have no Reject.
 */
export function ReviewControls({
  record,
  status,
  name,
  blockers = [],
  onEdit,
  isCompact = false,
  className
}: ReviewControlsProps) {
  const { actions } = useRulebookWorkspace()
  const [isBusy, setIsBusy] = useState(false)
  if (!actions) {
    return null
  }
  const review = async (next: T.Review["status"]) => {
    setIsBusy(true)
    const result = await reviewRecord(actions, record, next)
    setIsBusy(false)
    // A decided row leaves a "to review" list, so the decision is confirmed where it can still be undone.
    if (isCompact && next !== "proposed" && result && result.skipped.length === 0) {
      toast.success(`${next === "approved" ? "Approved" : "Rejected"}${name ? `: ${name}` : ""}`, {
        action: { label: "Undo", onClick: () => void reviewRecord(actions, record, "proposed") }
      })
    }
  }
  const size = isCompact ? "sm" : "default"
  const named = (label: string) => (name ? `${label} ${name}` : undefined)
  const edit = onEdit ? (
    <Button size={size} variant="ghost" disabled={isBusy} onClick={onEdit} aria-label={named("Edit")}>
      <PencilIcon />
      Edit
    </Button>
  ) : null

  if (status !== "proposed") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm",
            status === "approved" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {status === "approved" ? (
            <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : null}
          {status === "approved" ? "Approved" : "Rejected"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={isBusy}
          aria-label={name ? `Undo the ${status === "approved" ? "approval" : "rejection"} of ${name}` : undefined}
          onClick={() => void review("proposed")}
        >
          <RotateCcwIcon />
          Undo
        </Button>
        {edit}
      </div>
    )
  }
  const [blocker] = blockers
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {blocker && !isCompact ? (
        <p className="text-sm text-muted-foreground">
          {blockers.length === 1 ? blocker : `${blocker} Also: ${blockers.slice(1).join(" ")}`}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {isCompact && blocker ? (
          <span className="text-sm text-muted-foreground">Can&rsquo;t be approved yet</span>
        ) : (
          <Button
            size={size}
            variant={isCompact ? "outline" : "default"}
            disabled={isBusy || blockers.length > 0}
            aria-label={named("Approve")}
            onClick={() => void review("approved")}
          >
            <CheckIcon />
            Approve
          </Button>
        )}
        {record.type === "settings" ? null : (
          <Button
            size={size}
            variant="ghost"
            disabled={isBusy}
            aria-label={named("Reject")}
            onClick={() => void review("rejected")}
          >
            Reject
          </Button>
        )}
        {edit}
      </div>
    </div>
  )
}
