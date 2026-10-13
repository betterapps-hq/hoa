import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, SquareArrowOutUpRightIcon, Trash2Icon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { RowActions, type RowAction } from "@/components/RowActions/RowActions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import type { ProjectTypeStatus } from "@/projectTypes/projectType"

// The administrator's actions on a project type (application-review.md, Project types), on the list's cards and in the
// type's own page actions: open or edit it, archive it (hidden from new applications, kept for the ones that use it) or
// unarchive it, and delete it. Deleting asks first, naming the type; when applications use it, the confirmation says
// so and offers archiving instead.

export type ProjectTypeMenuProps = {
  label: string
  status: ProjectTypeStatus
  applicationCount: number
  /** Opens the type's page; left out on the page itself. */
  onOpen?: () => void
  /** Edits the name and description; left out on the list. */
  onEdit?: () => void
  onSetStatus: (status: ProjectTypeStatus) => Promise<void>
  onDelete: () => Promise<void>
  /** Says what went wrong with an action. */
  onError: (message: string) => void
}

const applicationsUsing = (count: number) => (count === 1 ? "1 application uses" : `${count} applications use`)

/** What deleting means for this type: gone for good, or kept for the applications that use it. */
function deleteText(applicationCount: number, isArchived: boolean) {
  if (applicationCount === 0) {
    return "Homeowners won't be able to choose it any more. This can't be undone."
  }
  if (isArchived) {
    return `${applicationsUsing(applicationCount)} it, so it stays. It's already archived, so homeowners can't choose it for new applications.`
  }
  return `${applicationsUsing(applicationCount)} it. Archive it instead: it's hidden from new applications and kept for the ones that use it.`
}

/** The type's actions, and the confirmation deleting opens, to render beside them. */
export function useProjectTypeActions({
  label,
  status,
  applicationCount,
  onOpen,
  onEdit,
  onSetStatus,
  onDelete,
  onError
}: ProjectTypeMenuProps): { actions: RowAction[]; confirmation: ReactNode } {
  const [isConfirming, setIsConfirming] = useState(false)
  const isArchived = status === "archived"
  const isUsed = applicationCount > 0
  const act = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action()
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : fallback)
    }
  }
  const setStatus = (next: ProjectTypeStatus) => act(() => onSetStatus(next), "The project type wasn't changed.")
  const actions: RowAction[] = [
    ...(onOpen ? [{ label: "Open", icon: SquareArrowOutUpRightIcon, onSelect: onOpen }] : []),
    ...(onEdit ? [{ label: "Edit name and description", icon: PencilIcon, onSelect: onEdit }] : []),
    isArchived
      ? { label: "Unarchive", icon: ArchiveRestoreIcon, onSelect: () => void setStatus("active") }
      : { label: "Archive", icon: ArchiveIcon, onSelect: () => void setStatus("archived") },
    { label: "Delete", icon: Trash2Icon, onSelect: () => setIsConfirming(true), isDestructive: true }
  ]
  const confirmation = (
    <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isUsed ? `${label} can't be deleted` : `Delete ${label}?`}</AlertDialogTitle>
          <AlertDialogDescription>{deleteText(applicationCount, isArchived)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {isUsed && isArchived ? (
            <AlertDialogCancel>Close</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {isUsed ? (
                <AlertDialogAction onClick={() => void setStatus("archived")}>Archive</AlertDialogAction>
              ) : (
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void act(onDelete, "The project type wasn't deleted.")}
                >
                  Delete
                </AlertDialogAction>
              )}
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { actions, confirmation }
}

/** The type's actions behind an ellipsis, as on the list's cards. */
export function ProjectTypeMenu(props: ProjectTypeMenuProps) {
  const { actions, confirmation } = useProjectTypeActions(props)
  return (
    <>
      <RowActions name={props.label} actions={actions} />
      {confirmation}
    </>
  )
}
