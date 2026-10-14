import { useState, type ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { saveThenClose } from "@/lib/form"

type DangerDialogProps = {
  title: string
  description: ReactNode
  /** Text to type to confirm, such as the association's name; without it, the button alone confirms. */
  typeToConfirm?: string
  confirmLabel: string
  /** Does it. A failure has said why, and keeps the dialog open. */
  onConfirm: () => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Confirms something that can't be undone, such as removing someone or deleting an association. */
export function DangerDialog({
  title,
  description,
  typeToConfirm,
  confirmLabel,
  onConfirm,
  onOpenChange
}: DangerDialogProps) {
  const [typed, setTyped] = useState("")
  const [isWorking, setWorking] = useState(false)
  const isConfirmed = !typeToConfirm || typed.trim() === typeToConfirm
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm ? (
          <Field>
            <FieldLabel htmlFor="danger-confirm">
              <span>
                Type <span className="font-semibold">{typeToConfirm}</span> to confirm
              </span>
            </FieldLabel>
            <Input
              id="danger-confirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!isConfirmed || isWorking}
            onClick={async () => {
              setWorking(true)
              await saveThenClose(onConfirm, () => onOpenChange(false))
              setWorking(false)
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
