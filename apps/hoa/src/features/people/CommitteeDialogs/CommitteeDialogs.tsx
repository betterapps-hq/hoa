import { useForm } from "@tanstack/react-form"
import { z } from "zod"
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
  board: "The board",
  architectural: "Architectural committee: decides applications",
  other: "Another committee"
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
            <DialogTitle>{committee ? `Edit ${committee.name}` : "Add a committee"}</DialogTitle>
            <DialogDescription>The board, or a committee such as architectural review.</DialogDescription>
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
                  <FieldLabel htmlFor="committee-kind">What it is</FieldLabel>
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
  committeeId: z.string().min(1, "Pick the board or a committee."),
  personId: z.string().min(1, "Pick someone on the roll."),
  role: z.enum(committeeRoles),
  office: z.string().trim().max(80),
  startedOn: z.union([z.literal(""), z.iso.date("Give a date.")])
})

/** A committee to seat someone on, who's picked from the roll; or someone to seat, on a committee picked from these. */
type Seat =
  | { committee: Committee; people: readonly RollChoice[] }
  | { person: { id: string; name: string }; committees: readonly Committee[] }

type MemberDialogProps = {
  seat: Seat
  onSave: (member: {
    committeeId: string
    personId: string
    role: CommitteeRole
    office: string
    startedOn: string
  }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Seats someone on the board or a committee: from the committee, or from the person. */
export function MemberDialog({ seat, onSave, onOpenChange }: MemberDialogProps) {
  const forCommittee = "committee" in seat ? seat : null
  const forPerson = "person" in seat ? seat : null
  const committees = forCommittee ? [forCommittee.committee] : (forPerson?.committees ?? [])
  const form = useForm({
    defaultValues: {
      committeeId: forCommittee?.committee.id ?? (committees.length === 1 ? (committees[0]?.id ?? "") : ""),
      personId: forPerson?.person.id ?? "",
      role: "member" as CommitteeRole,
      office: "",
      startedOn: ""
    },
    validators: { onSubmit: memberSchema },
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
            <DialogTitle>
              {forCommittee
                ? `Add someone to ${forCommittee.committee.name}`
                : `Add ${forPerson?.person.name ?? "them"} to the board or a committee`}
            </DialogTitle>
            <DialogDescription>Their term starts on the day you give, or now.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {forCommittee ? (
              <form.Field name="personId">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="member-person">
                      Person
                      {required}
                    </FieldLabel>
                    <RollPicker
                      id="member-person"
                      choices={forCommittee.people}
                      value={field.state.value}
                      onChange={field.handleChange}
                      placeholder="Find someone on the roll"
                      empty="Nobody on the roll matches."
                      isInvalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ) : (
              <form.Field name="committeeId">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="member-committee">
                      Board or committee
                      {required}
                    </FieldLabel>
                    <NativeSelect
                      id="member-committee"
                      className="w-full"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    >
                      <NativeSelectOption value="">Pick one</NativeSelectOption>
                      {committees.map((committee) => (
                        <NativeSelectOption key={committee.id} value={committee.id}>
                          {committee.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}
            <form.Subscribe
              selector={(state) => committees.find((committee) => committee.id === state.values.committeeId)}
            >
              {(committee) => {
                const isBoard = committee?.kind === "board"
                return (
                  <>
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
                            <NativeSelectOption value="chair">
                              {isBoard ? "Chair or president" : "Chair"}
                            </NativeSelectOption>
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
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                            />
                            <FieldDescription>Such as President, Treasurer or Secretary.</FieldDescription>
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                  </>
                )
              }}
            </form.Subscribe>
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
