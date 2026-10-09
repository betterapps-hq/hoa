import { CheckCheckIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { RecordRef } from "@/rulebook/review"
import { attempt } from "../attempt"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type BulkApproveProps = {
  refs: RecordRef[]
  /** What the records are, in the plural: "rules", "terms", "reasons". */
  noun: string
}

/** Approves every record a filter shows, after a confirmation; records something blocks stay to review. */
export function BulkApprove({ refs, noun }: BulkApproveProps) {
  const { actions } = useRulebookWorkspace()
  const [isBusy, setIsBusy] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  if (!actions || refs.length === 0) {
    return null
  }
  const approve = async () => {
    setIsOpen(false)
    setIsBusy(true)
    const result = await attempt(() => actions.review(refs, "approved", null), "Nothing was approved.")
    setIsBusy(false)
    if (result) {
      const [first] = result.skipped
      toast.success(
        first
          ? `Approved ${result.updated}. ${result.skipped.length} stay to review, such as one where: ${first.reasons[0] ?? ""}`
          : `Approved ${result.updated}.`
      )
    }
  }
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isBusy} />}>
        <CheckCheckIcon />
        Approve the {refs.length} {noun} shown
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Approve the {refs.length} {noun} shown?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Each one is checked first: any with open problems, unreviewed terms or an open question stays to review.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void approve()}>Approve them</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
