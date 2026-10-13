import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { RowActions, type RowAction } from "@/components/RowActions/RowActions"
import type { RecordRef } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { reviewRecord } from "../attempt"
import { approveLabel } from "../ReviewControls/ReviewControls.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type ReviewMenuProps = {
  /** The record reviewed. */
  record: RecordRef
  status: T.Review["status"]
  /** What the row is called, in the menu's accessible name and the confirmation. */
  name: string
  /** Why it can't be approved yet; Approve waits until there's nothing. */
  blockers?: string[]
  /** What else the row offers, after its review: editing a term, merging it. */
  more?: (RowAction | null)[]
}

/**
 * A row's review in a table (encoding.md, UX; ux.md, Menus and lists): a decided record says so in words, and the
 * ellipsis menu approves, rejects or sends it back to review. Approving or rejecting confirms with an undo.
 */
export function ReviewMenu({ record, status, name, blockers = [], more = [] }: ReviewMenuProps) {
  const { actions, approval, records } = useRulebookWorkspace()
  const [isBusy, setIsBusy] = useState(false)
  if (!actions) {
    return null
  }
  const review = async (next: T.Review["status"]) => {
    setIsBusy(true)
    const result = await reviewRecord(actions, record, next)
    setIsBusy(false)
    // A decided row leaves a "to review" table, so the decision is confirmed where it can still be undone.
    if (next !== "proposed" && result && result.skipped.length === 0) {
      toast.success(`${next === "approved" ? "Approved" : "Rejected"}: ${name}`, {
        action: { label: "Undo", onClick: () => void reviewRecord(actions, record, "proposed") }
      })
    }
  }
  const [blocker] = blockers
  return (
    <div className="flex items-center justify-end gap-2">
      {status === "proposed" ? null : (
        <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
          {status === "approved" ? (
            <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : null}
          {status === "approved" ? "Approved" : "Rejected"}
        </span>
      )}
      <RowActions
        name={name}
        disabled={isBusy}
        note={status === "proposed" && blocker ? `Can’t be approved yet. ${blockers.join(" ")}` : null}
        actions={[
          ...(status === "proposed"
            ? [
                {
                  label: approveLabel(approval, records, record),
                  icon: CheckIcon,
                  disabled: blockers.length > 0,
                  onSelect: () => void review("approved")
                },
                { label: "Reject", icon: XIcon, isDestructive: true, onSelect: () => void review("rejected") }
              ]
            : [
                {
                  label: status === "approved" ? "Undo the approval" : "Undo the rejection",
                  icon: RotateCcwIcon,
                  onSelect: () => void review("proposed")
                }
              ]),
          ...more.filter((item) => item !== null)
        ]}
      />
    </div>
  )
}
