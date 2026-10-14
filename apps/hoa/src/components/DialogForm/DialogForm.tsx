import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

export type DialogFormProps = {
  title: string
  description?: ReactNode
  submitLabel: string
  isDestructive?: boolean
  isSubmitting: boolean
  onSubmit: () => void
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** A dialog holding one form: its title, its fields, and Cancel beside the button that saves it. */
export function DialogForm({
  title,
  description,
  submitLabel,
  isDestructive = false,
  isSubmitting,
  onSubmit,
  onOpenChange,
  children
}: DialogFormProps) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <FieldGroup>{children}</FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant={isDestructive ? "destructive" : "default"} disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
