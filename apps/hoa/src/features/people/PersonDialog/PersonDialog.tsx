import { PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Field,
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
import { AddressFields } from "@/features/places/AddressFields/AddressFields"
import { ChoiceSelect } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { saveThenClose, useAppForm } from "@/lib/form"
import {
  accessChoices,
  personInputSchema,
  seatInputSchema,
  relationChoices,
  relationLabels,
  unitInputSchema,
  unitRelations,
  type Access,
  type Committee,
  type Person,
  type SeatInput,
  type UnitInput,
  type UnitRelation
} from "@/people/people"
import { phoneText } from "@/people/phone"
import { addressValues, type AddressInput } from "@/places/address"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"
import { SeatFields, seatValues } from "../SeatFields/SeatFields"
import { UnitFields, unitValues } from "../UnitFields/UnitFields"

/** A seat to add on the board or a committee. */
export type NewSeat = { committeeId: string; seat: SeatInput }

export type PersonSave = {
  person: { name: string; email: string; phone: string; mailingAddress: AddressInput; access: Access }
  /**
   * Units to put them in, as an owner, resident or tenant: one on the roll by its id, or a new one to add; and their time
   * in units they're in (by link) to end today.
   */
  homes: { add: { unit: string | UnitInput; relation: UnitRelation }[]; end: string[] }
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
  /** The units they're in today, and how. */
  homes: readonly { linkId: string; unit: string; relation: UnitRelation }[]
  /** Whether they can be put in a new unit, added here; the board doesn't add units. */
  canAddUnits: boolean
  /** Their membership's access once they've joined; null before, when their invitation sets it. */
  access: Access | null
  /** For an admin: their role and assignments. Null for the board, which can't change either. */
  assignments: AssignmentChoices | null
  onSave: (save: PersonSave) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** A unit row: a unit to pick, or once it's null, a new unit's form. */
const newHome = (key: string) => ({
  key,
  unitId: "",
  relation: "owner" as UnitRelation,
  unit: null as UnitInput | null
})

const formSchema = personInputSchema.extend({
  leavingHomes: z.array(z.string()),
  newHomes: z.array(
    z.object({
      key: z.string(),
      unitId: z.string(),
      relation: z.enum(unitRelations),
      unit: unitInputSchema.nullable()
    })
  ),
  ending: z.array(z.string()),
  adding: z.array(
    z.object({ key: z.string(), committeeId: z.string().min(1, "Pick a committee."), seat: seatInputSchema })
  )
})

/** Adds someone to the roll, with the unit they live in, or edits them; and for an administrator, their assignments. */
export function PersonDialog({
  person,
  units,
  homes,
  canAddUnits,
  access,
  assignments,
  onSave,
  onOpenChange
}: PersonDialogProps) {
  // Someone new starts with a unit to pick; the key is made once, as the form's defaults must stay the same.
  const [firstHomeKey] = useState<string>(() => crypto.randomUUID())
  const form = useAppForm({
    defaultValues: {
      name: person?.name ?? "",
      email: person?.email ?? "",
      phone: person?.phone ? phoneText(person.phone) : "",
      mailingAddress: addressValues(person?.mailingAddress ?? null),
      access: access ?? ("member" as Access),
      leavingHomes: [] as string[],
      newHomes: person ? [] : [newHome(firstHomeKey)],
      ending: [] as string[],
      adding: [] as (NewSeat & { key: string })[]
    },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) =>
      saveThenClose(
        () =>
          onSave({
            person: {
              name: value.name,
              email: value.email,
              phone: value.phone,
              mailingAddress: value.mailingAddress,
              access: value.access
            },
            homes: {
              add: value.newHomes.flatMap(({ unitId, unit, relation }) => {
                const home = unit ?? unitId
                return home ? [{ unit: home, relation }] : []
              }),
              end: value.leavingHomes
            },
            assignments: {
              add: value.adding.map(({ committeeId, seat }) => ({ committeeId, seat })),
              end: value.ending
            }
          }),
        () => onOpenChange(false)
      )
  })
  const text = (
    name: "name" | "email" | "phone",
    label: string,
    extra: Partial<{ type: string; autoComplete: string; required: boolean; description: string }> = {}
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={field.state.meta.errors.length > 0}>
          <FieldLabel htmlFor={`person-${name}`}>
            {label}
            {extra.required ? <RequiredMark /> : null}
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
            <AddressFields
              form={form}
              fields="mailingAddress"
              idPrefix="person-mailing"
              legend="Mailing address"
              description="Only if their mail should go somewhere other than their unit."
              addLabel="Add a mailing address"
            />
            <FieldSet>
              <FieldLegend variant="label">Units</FieldLegend>
              <div className="flex flex-col gap-3">
                <form.Field name="leavingHomes">
                  {(field) =>
                    homes.map((home) => {
                      const isLeaving = field.state.value.includes(home.linkId)
                      return (
                        <Item key={home.linkId} variant="outline" size="sm">
                          <ItemContent>
                            <ItemTitle className={isLeaving ? "text-muted-foreground line-through" : undefined}>
                              {home.unit}
                            </ItemTitle>
                            <ItemDescription>
                              {isLeaving ? "Ends today" : relationLabels[home.relation]}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                field.handleChange(
                                  isLeaving
                                    ? field.state.value.filter((id) => id !== home.linkId)
                                    : [...field.state.value, home.linkId]
                                )
                              }
                            >
                              {isLeaving ? "Undo" : "End"}
                            </Button>
                          </ItemActions>
                        </Item>
                      )
                    })
                  }
                </form.Field>
                <form.Field name="newHomes" mode="array">
                  {(field) => (
                    <>
                      {field.state.value.map((home, index) => (
                        // A new unit's address opens in its row, in place of the picker.
                        <div
                          key={home.key}
                          className={home.unit ? "flex flex-col gap-4 rounded-lg border p-3" : undefined}
                        >
                          <div className="flex items-start gap-2">
                            {home.unit ? (
                              <p className="min-w-0 flex-1 self-center text-sm font-medium">New unit</p>
                            ) : (
                              <form.Field name={`newHomes[${index}].unitId`}>
                                {(homeField) => (
                                  <div className="min-w-0 flex-1">
                                    <RollPicker
                                      id={`person-unit-${home.key}`}
                                      label="Unit"
                                      choices={units}
                                      value={homeField.state.value}
                                      onChange={homeField.handleChange}
                                      placeholder="Find a unit"
                                      empty="No units match."
                                      onCreate={
                                        canAddUnits
                                          ? (street) => {
                                              field.replaceValue(index, {
                                                ...form.getFieldValue(`newHomes[${index}]`),
                                                unitId: "",
                                                unit: unitValues(null, street)
                                              })
                                              // The picker gives way to the address; carry on typing there.
                                              requestAnimationFrame(() =>
                                                document.getElementById(`unit-${home.key}-street`)?.focus()
                                              )
                                            }
                                          : undefined
                                      }
                                      createLabel="New unit"
                                    />
                                  </div>
                                )}
                              </form.Field>
                            )}
                            <form.Field name={`newHomes[${index}].relation`}>
                              {(homeField) => (
                                <ChoiceSelect
                                  label="As"
                                  className="w-32"
                                  value={homeField.state.value}
                                  choices={relationChoices}
                                  onChange={homeField.handleChange}
                                />
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
                          {home.unit ? (
                            <UnitFields form={form} fields={`newHomes[${index}].unit`} idPrefix={`unit-${home.key}`} />
                          ) : null}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => field.pushValue(newHome(crypto.randomUUID()))}
                      >
                        <PlusIcon />
                        Add unit
                      </Button>
                    </>
                  )}
                </form.Field>
              </div>
            </FieldSet>
            {assignments && access !== null ? (
              <form.Field name="access">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="person-role">Role</FieldLabel>
                    <ChoiceSelect
                      id="person-role"
                      className="w-full"
                      value={field.state.value}
                      choices={accessChoices}
                      onChange={field.handleChange}
                    />
                    <FieldDescription>An admin manages everything here.</FieldDescription>
                  </Field>
                )}
              </form.Field>
            ) : null}
          </FieldGroup>
          {assignments ? (
            <FieldSet>
              <FieldLegend variant="label">Assignments</FieldLegend>
              <div className="flex flex-col gap-3">
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
                          <div key={seat.key} className="flex flex-col gap-4 rounded-lg border p-3">
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
                              {(committeeId) => (
                                <SeatFields
                                  form={form}
                                  fields={`adding[${index}].seat`}
                                  idPrefix={`seat-${seat.key}`}
                                  isBoard={open.find((committee) => committee.id === committeeId)?.kind === "board"}
                                />
                              )}
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
                              field.pushValue({ key: crypto.randomUUID(), committeeId: "", seat: seatValues(null) })
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
