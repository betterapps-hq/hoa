import { useForm } from "@tanstack/react-form"
import { PlusIcon, XIcon } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  committeeRoles,
  personInputSchema,
  relationLabels,
  unitRelations,
  type Access,
  type Committee,
  type CommitteeRole,
  type Person,
  type UnitRelation
} from "@/people/people"
import { phoneText } from "@/people/phone"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"

/** A seat to add on the board or a committee. */
export type NewSeat = { committeeId: string; role: CommitteeRole; office: string }

export type PersonSave = {
  person: { name: string; email: string; phone: string; mailingAddress: string; access: Access }
  /** For someone new: the unit they own, live in or rent, if any. */
  home: { unitId: string; relation: UnitRelation } | null
  /** Seats to add, and the seats they hold (by their member id) to end today. */
  assignments: { add: NewSeat[]; end: string[] }
}

/** Someone's seats today, and every committee, to end one or add another. */
export type AssignmentChoices = {
  seats: readonly { memberId: string; committeeId: string; committee: string; label: string }[]
  committees: readonly Committee[]
}

type PersonDialogProps = {
  /** The person to edit; null to add someone. */
  person: Person | null
  units: readonly RollChoice[]
  /** Their membership's access once they've joined; null before, when their invitation sets it. */
  access: Access | null
  /** For an administrator: their assignments, and making them one. Null for the board, which can't change either. */
  assignments: AssignmentChoices | null
  onSave: (save: PersonSave) => Promise<void>
  onOpenChange: (open: boolean) => void
}

const isRelation = (value: string): value is UnitRelation => unitRelations.some((relation) => relation === value)
const isRole = (value: string): value is CommitteeRole => committeeRoles.some((role) => role === value)

const formSchema = personInputSchema.omit({ access: true }).extend({
  isAdministrator: z.boolean(),
  unitId: z.string(),
  relation: z.enum(unitRelations),
  ending: z.array(z.string()),
  adding: z.array(
    z.object({
      key: z.string(),
      committeeId: z.string().min(1, "Pick a committee."),
      role: z.enum(committeeRoles),
      office: z.string().trim().max(80)
    })
  )
})

/** Adds someone to the roll, with the unit they live in, or edits them; and for an administrator, their assignments. */
export function PersonDialog({ person, units, access, assignments, onSave, onOpenChange }: PersonDialogProps) {
  const form = useForm({
    defaultValues: {
      name: person?.name ?? "",
      email: person?.email ?? "",
      phone: person?.phone ? phoneText(person.phone) : "",
      mailingAddress: person?.mailingAddress ?? "",
      isAdministrator: access === "administrator",
      unitId: "",
      relation: "owner" as UnitRelation,
      ending: [] as string[],
      adding: [] as (NewSeat & { key: string })[]
    },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        person: {
          name: value.name,
          email: value.email,
          phone: value.phone,
          mailingAddress: value.mailingAddress,
          access: value.isAdministrator ? "administrator" : "member"
        },
        home: !person && value.unitId ? { unitId: value.unitId, relation: value.relation } : null,
        assignments: {
          add: value.adding.map(({ committeeId, role, office }) => ({ committeeId, role, office: office.trim() })),
          end: value.ending
        }
      })
      onOpenChange(false)
    }
  })
  const text = (
    name: "name" | "email" | "phone" | "mailingAddress",
    label: string,
    extra: Partial<{ type: string; autoComplete: string; required: boolean; description: string }> = {}
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={field.state.meta.errors.length > 0}>
          <FieldLabel htmlFor={`person-${name}`}>
            {label}
            {extra.required ? (
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            ) : null}
          </FieldLabel>
          <Input
            id={`person-${name}`}
            type={extra.type ?? "text"}
            autoComplete={extra.autoComplete ?? "off"}
            required={extra.required}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            aria-invalid={field.state.meta.errors.length > 0}
          />
          {extra.description ? <FieldDescription>{extra.description}</FieldDescription> : null}
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
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
            <DialogTitle>{person ? `Edit ${person.name}` : "Add person"}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {text("name", "Name", { required: true })}
            {text("email", "Email", {
              type: "email",
              ...(person ? { description: "Changing it unlinks their account." } : {})
            })}
            {text("phone", "Phone", { type: "tel" })}
            {text("mailingAddress", "Mailing address", { description: "If not their unit." })}
            {!person && units.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <form.Field name="unitId">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="person-unit">Unit</FieldLabel>
                      <RollPicker
                        id="person-unit"
                        choices={units}
                        value={field.state.value}
                        onChange={field.handleChange}
                        placeholder="Find a unit"
                        empty="No units match."
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="relation">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="person-relation">As</FieldLabel>
                      <NativeSelect
                        id="person-relation"
                        className="w-full"
                        value={field.state.value}
                        onChange={(event) => {
                          if (isRelation(event.target.value)) {
                            field.handleChange(event.target.value)
                          }
                        }}
                      >
                        {unitRelations.map((relation) => (
                          <NativeSelectOption key={relation} value={relation}>
                            {relationLabels[relation]}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                </form.Field>
              </div>
            ) : null}
          </FieldGroup>
          {assignments ? (
            <FieldSet>
              <FieldLegend variant="label">Assignments</FieldLegend>
              <div className="flex flex-col gap-3">
                {access === null ? null : (
                  <form.Field name="isAdministrator">
                    {(field) => (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="person-administrator"
                          checked={field.state.value}
                          onCheckedChange={(checked) => field.handleChange(checked)}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="person-administrator" className="font-normal">
                            Administrator
                          </FieldLabel>
                          <FieldDescription>Manages everything here.</FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  </form.Field>
                )}
                <form.Field name="ending">
                  {(field) =>
                    assignments.seats.map((seat) => {
                      const isEnding = field.state.value.includes(seat.memberId)
                      return (
                        <Item key={seat.memberId} variant="outline" size="sm">
                          <ItemContent>
                            <ItemTitle className={isEnding ? "text-muted-foreground line-through" : undefined}>
                              {seat.committee}
                            </ItemTitle>
                            <ItemDescription>{isEnding ? "Ends today" : seat.label}</ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                field.handleChange(
                                  isEnding
                                    ? field.state.value.filter((id) => id !== seat.memberId)
                                    : [...field.state.value, seat.memberId]
                                )
                              }
                            >
                              {isEnding ? "Undo" : "End"}
                            </Button>
                          </ItemActions>
                        </Item>
                      )
                    })
                  }
                </form.Field>
                <form.Field name="adding" mode="array">
                  {(field) => {
                    const held = new Set(assignments.seats.map((seat) => seat.committeeId))
                    const open = assignments.committees.filter((committee) => !held.has(committee.id))
                    return (
                      <>
                        {field.state.value.map((seat, index) => (
                          <div key={seat.key} className="flex flex-col gap-2 rounded-lg border p-3">
                            <div className="flex items-start gap-2">
                              <form.Field name={`adding[${index}].committeeId`}>
                                {(seatField) => (
                                  <Field
                                    data-invalid={seatField.state.meta.errors.length > 0}
                                    className="min-w-0 flex-1"
                                  >
                                    <NativeSelect
                                      aria-label="Committee"
                                      className="w-full"
                                      value={seatField.state.value}
                                      onChange={(event) => seatField.handleChange(event.target.value)}
                                      aria-invalid={seatField.state.meta.errors.length > 0}
                                    >
                                      <NativeSelectOption value="">Pick a committee</NativeSelectOption>
                                      {open.map((committee) => (
                                        <NativeSelectOption key={committee.id} value={committee.id}>
                                          {committee.name}
                                        </NativeSelectOption>
                                      ))}
                                    </NativeSelect>
                                    <FieldError errors={seatField.state.meta.errors} />
                                  </Field>
                                )}
                              </form.Field>
                              <form.Field name={`adding[${index}].role`}>
                                {(seatField) => (
                                  <NativeSelect
                                    aria-label="Role"
                                    className="w-28"
                                    value={seatField.state.value}
                                    onChange={(event) => {
                                      if (isRole(event.target.value)) {
                                        seatField.handleChange(event.target.value)
                                      }
                                    }}
                                  >
                                    <NativeSelectOption value="member">Member</NativeSelectOption>
                                    <NativeSelectOption value="chair">Chair</NativeSelectOption>
                                  </NativeSelect>
                                )}
                              </form.Field>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remove"
                                onClick={() => field.removeValue(index)}
                              >
                                <XIcon />
                              </Button>
                            </div>
                            <form.Subscribe selector={(state) => state.values.adding[index]?.committeeId}>
                              {(committeeId) =>
                                open.find((committee) => committee.id === committeeId)?.kind === "board" ? (
                                  <form.Field name={`adding[${index}].office`}>
                                    {(seatField) => (
                                      <Input
                                        aria-label="Office"
                                        placeholder="Office, such as Treasurer"
                                        value={seatField.state.value}
                                        onBlur={seatField.handleBlur}
                                        onChange={(event) => seatField.handleChange(event.target.value)}
                                      />
                                    )}
                                  </form.Field>
                                ) : null
                              }
                            </form.Subscribe>
                          </div>
                        ))}
                        {open.length > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-start"
                            onClick={() =>
                              field.pushValue({ key: crypto.randomUUID(), committeeId: "", role: "member", office: "" })
                            }
                          >
                            <PlusIcon />
                            Add assignment
                          </Button>
                        ) : null}
                      </>
                    )
                  }}
                </form.Field>
              </div>
            </FieldSet>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {person ? "Save" : "Add person"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
