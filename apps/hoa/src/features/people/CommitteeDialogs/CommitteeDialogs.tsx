import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  committeeInputSchema,
  committeeKinds,
  committeeRoles,
  type Committee,
  type CommitteeKind,
  type CommitteeRole
} from "@/people/people"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"

const required = (
  <span aria-hidden className="ml-0.5 text-destructive">
    *
  </span>
)

const kindChoices: Record<CommitteeKind, string> = {
  board: "Board",
  architectural: "Architectural review",
  other: "Other"
}

const isKind = (value: string): value is CommitteeKind => committeeKinds.some((kind) => kind === value)
const isRole = (value: string): value is CommitteeRole => committeeRoles.some((role) => role === value)

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
                    {required}
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
                  <NativeSelect
                    id="committee-kind"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) => {
                      if (isKind(event.target.value)) {
                        field.handleChange(event.target.value)
                      }
                    }}
                  >
                    {committeeKinds.map((kind) => (
                      <NativeSelectOption key={kind} value={kind}>
                        {kindChoices[kind]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
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

const memberSchema = z.object({
  personId: z.string().min(1, "Pick someone."),
  role: z.enum(committeeRoles),
  office: z.string().trim().max(80),
  startedOn: z.union([z.literal(""), z.iso.date("Give a date.")])
})

type MemberDialogProps = {
  committee: Committee
  people: readonly RollChoice[]
  onSave: (member: {
    committeeId: string
    personId: string
    role: CommitteeRole
    office: string
    startedOn: string
  }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Seats someone on the board or a committee, from the committee. */
export function MemberDialog({ committee, people, onSave, onOpenChange }: MemberDialogProps) {
  const isBoard = committee.kind === "board"
  const form = useForm({
    defaultValues: { personId: "", role: "member" as CommitteeRole, office: "", startedOn: "" },
    validators: { onSubmit: memberSchema },
    onSubmit: async ({ value }) => {
      await onSave({ ...value, committeeId: committee.id })
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
            <DialogTitle>Add to {committee.name}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="personId">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="member-person">
                    Person
                    {required}
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
            <form.Field name="role">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="member-role">Role</FieldLabel>
                  <NativeSelect
                    id="member-role"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) => {
                      if (isRole(event.target.value)) {
                        field.handleChange(event.target.value)
                      }
                    }}
                  >
                    <NativeSelectOption value="member">Member</NativeSelectOption>
                    <NativeSelectOption value="chair">Chair</NativeSelectOption>
                  </NativeSelect>
                </Field>
              )}
            </form.Field>
            {isBoard ? (
              <form.Field name="office">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="member-office">Office</FieldLabel>
                    <Input
                      id="member-office"
                      placeholder="Treasurer"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
            ) : null}
            <form.Field name="startedOn">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="member-since">Since</FieldLabel>
                  <Input
                    id="member-since"
                    type="date"
                    className="w-44"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
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
                  Add
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
