import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChoiceSelect } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { useAppForm } from "@/lib/form"
import {
  committeeInputSchema,
  committeeKindChoices,
  nextTermStart,
  seatInputSchema,
  type Committee,
  type CommitteeKind,
  type CommitteeMember,
  type SeatInput
} from "@/people/people"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"
import { SeatFields, seatValues } from "../SeatFields/SeatFields"

type CommitteeDialogProps = {
  committee: Committee | null
  onSave: (committee: { name: string; kind: CommitteeKind }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds the board or a committee, or renames one. */
export function CommitteeDialog({ committee, onSave, onOpenChange }: CommitteeDialogProps) {
  const form = useForm({
    defaultValues: { name: committee?.name ?? "", kind: committee?.kind ?? ("other" as CommitteeKind) },
    validators: { onSubmit: committeeInputSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
      onOpenChange(false)
    }
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            <DialogTitle>{committee ? `Edit ${committee.name}` : "Add committee"}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="name">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="committee-name">
                    Name
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="committee-name"
                    required
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="kind">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="committee-kind">Type</FieldLabel>
                  <ChoiceSelect
                    id="committee-kind"
                    className="w-full"
                    value={field.state.value}
                    choices={committeeKindChoices}
                    onChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {committee ? "Save" : "Add committee"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Their seat, to correct its term ("edit") or to follow it with their next ("renew"). */
export type SeatChange = { member: CommitteeMember; personName: string; mode: "edit" | "renew" }

type MemberDialogProps = {
  committee: Committee
  people: readonly RollChoice[]
  /** The seat to change; null to seat someone for a first term. */
  change: SeatChange | null
  today: string
  onSave: (save: { personId: string; seat: SeatInput }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Seats someone on the board or a committee, corrects their term, or starts their next one. */
export function MemberDialog({ committee, people, change, today, onSave, onOpenChange }: MemberDialogProps) {
  const mode = change?.mode ?? "add"
  const isRenewing = mode === "renew"
  const form = useAppForm({
    defaultValues: {
      personId: change?.member.personId ?? "",
      seat:
        change && isRenewing
          ? { ...seatValues(change.member), startedOn: nextTermStart(change.member, today), termEndsOn: "" }
          : seatValues(change?.member ?? null)
    },
    validators: {
      onSubmit: z.object({
        personId: z.string().min(1, "Pick someone."),
        seat: isRenewing
          ? seatInputSchema.refine((seat) => seat.startedOn, {
              message: "Give the day it starts.",
              path: ["startedOn"]
            })
          : seatInputSchema
      })
    },
    onSubmit: async ({ value }) => {
      await onSave(value)
      onOpenChange(false)
    }
  })
  const title = {
    add: `Add to ${committee.name}`,
    edit: `Edit ${change?.personName}'s seat`,
    renew: `New term for ${change?.personName}`
  }[mode]
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {change ? null : (
              <form.Field name="personId">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="member-person">
                      Person
                      <RequiredMark />
                    </FieldLabel>
                    <RollPicker
                      id="member-person"
                      choices={people}
                      value={field.state.value}
                      onChange={field.handleChange}
                      placeholder="Search people"
                      empty="No matches."
                      isInvalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}
            <SeatFields form={form} fields="seat" idPrefix="member" isBoard={committee.kind === "board"} />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {{ add: "Add", edit: "Save", renew: "Start term" }[mode]}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
