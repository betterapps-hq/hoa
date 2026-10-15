import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"
import { DialogForm } from "@/components/DialogForm/DialogForm"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RollPicker, type RollChoice } from "@/features/people/RollPicker/RollPicker"
import { AddressFields } from "@/features/places/AddressFields/AddressFields"
import { messageOf } from "@/lib/attempt"
import { useAppForm } from "@/lib/form"
import { myDetailsSchema } from "@/people/people"
import type { AddressInput } from "@/places/address"

/** Someone's own details as the dialog edits them; empty text, or an empty address, for none. */
export type Details = { name: string; phone: string; mailingAddress: AddressInput }

type DetailsDialogProps = {
  details: Details
  /** Whether they're on a roll, which keeps the phone and mailing address. */
  hasContact: boolean
  onSave: (details: Details) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Edits someone's own name, and the phone and mailing address their association has for them. */
export function DetailsDialog({ details, hasContact, onSave, onOpenChange }: DetailsDialogProps) {
  const form = useAppForm({
    defaultValues: details,
    validators: { onSubmit: myDetailsSchema },
    onSubmit: async ({ value }) => {
      try {
        await onSave(value)
        onOpenChange(false)
      } catch (caught) {
        toast.error(messageOf(caught))
      }
    }
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title="Edit details"
          description={hasContact ? "Your name, and how the association reaches you." : undefined}
          submitLabel="Save"
          isWide={hasContact}
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="name">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="details-name">
                  Name
                  <RequiredMark />
                </FieldLabel>
                <Input
                  id="details-name"
                  required
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          {hasContact ? (
            <>
              <form.Field name="phone">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="details-phone">Phone</FieldLabel>
                    <Input
                      id="details-phone"
                      type="tel"
                      autoComplete="tel"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              <AddressFields
                form={form}
                fields="mailingAddress"
                idPrefix="details-mailing"
                legend="Mailing address"
                description="Only if your mail should go somewhere other than your home."
                addLabel="Add a mailing address"
              />
            </>
          ) : null}
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

type ClaimHomeDialogProps = {
  /** The homes on the roll that nobody owns yet. */
  homes: readonly RollChoice[]
  onClaim: (unitId: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Lets someone say which home on their association's roll is theirs, when nobody owns it on the roll yet. */
export function ClaimHomeDialog({ homes, onClaim, onOpenChange }: ClaimHomeDialogProps) {
  const form = useForm({
    defaultValues: { unitId: "" },
    validators: { onSubmit: z.object({ unitId: z.string().min(1, "Pick your home.") }) },
    onSubmit: async ({ value }) => {
      try {
        await onClaim(value.unitId)
        onOpenChange(false)
      } catch (caught) {
        toast.error(messageOf(caught))
      }
    }
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Add your home</DialogTitle>
            <DialogDescription>You&apos;re listed as its owner.</DialogDescription>
          </DialogHeader>
          <form.Field name="unitId">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="claim-home">
                  Your home
                  <RequiredMark />
                </FieldLabel>
                <RollPicker
                  id="claim-home"
                  choices={homes}
                  value={field.state.value}
                  onChange={field.handleChange}
                  placeholder="Find your address or lot"
                  empty="No home without an owner matches."
                  isInvalid={field.state.meta.errors.length > 0}
                />
                <FieldDescription>Not listed? Ask your board.</FieldDescription>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  Add home
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const newPassword = z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters.")

type PasswordDialogProps = {
  hasPassword: boolean
  onSave: (current: string, next: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds a password to the account, or changes the one it has. */
export function PasswordDialog({ hasPassword, onSave, onOpenChange }: PasswordDialogProps) {
  const form = useForm({
    defaultValues: { current: "", next: "" },
    validators: {
      onSubmit: z.object({
        current: hasPassword ? z.string().min(1, "Give your current password.") : z.string(),
        next: newPassword
      })
    },
    onSubmit: async ({ value }) => {
      try {
        await onSave(value.current, value.next)
        onOpenChange(false)
      } catch (caught) {
        toast.error(messageOf(caught))
      }
    }
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{hasPassword ? "Change your password" : "Add a password"}</DialogTitle>
            <DialogDescription className="sr-only">
              {hasPassword ? "Change the password you sign in with." : "Sign in with a password as well as a code."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {hasPassword ? (
              <form.Field name="current">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="current-password">
                      Current password
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      id="current-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ) : null}
            <form.Field name="next">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="next-password">
                    {hasPassword ? "New password" : "Password"}
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="next-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldDescription>At least 10 characters.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {hasPassword ? "Change password" : "Add password"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
