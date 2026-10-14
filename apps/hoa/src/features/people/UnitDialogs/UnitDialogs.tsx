import { useForm } from "@tanstack/react-form"
import { useState } from "react"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  relationLabels,
  unitInputSchema,
  unitRelations,
  type Unit,
  type UnitInput,
  type UnitRelation
} from "@/people/people"
import { unitNameFrom, usStates, type Place } from "@/places/address"
import { AddressSearch } from "../AddressSearch/AddressSearch"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"

const required = (
  <span aria-hidden className="ml-0.5 text-destructive">
    *
  </span>
)

type UnitDialogProps = {
  /** The unit to edit; null to add one. */
  unit: Unit | null
  onSave: (unit: UnitInput) => Promise<void>
  onOpenChange: (open: boolean) => void
}

type UnitText = "unitNumber" | "city" | "postalCode" | "label"

/**
 * Adds a unit to the roll or edits one. The address comes first: picking one the search suggests fills its unit
 * number, city, state and ZIP code, and the unit's name follows its house number until someone types a name.
 */
export function UnitDialog({ unit, onSave, onOpenChange }: UnitDialogProps) {
  const [isNameTyped, setNameTyped] = useState(unit !== null)
  const form = useForm({
    defaultValues: {
      street: unit?.street ?? "",
      unitNumber: unit?.unitNumber ?? "",
      city: unit?.city ?? "",
      state: unit?.state ?? "",
      postalCode: unit?.postalCode ?? "",
      label: unit?.label ?? "",
      lot: unit?.lot ?? "",
      place: unit?.place ?? (null as Place | null)
    },
    validators: { onSubmit: unitInputSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
      onOpenChange(false)
    }
  })
  /** Names the unit by its address's house number, until someone names it. */
  const nameFromAddress = () => {
    if (!isNameTyped) {
      form.setFieldValue("label", unitNameFrom(form.getFieldValue("street"), form.getFieldValue("unitNumber")))
    }
  }
  const text = (
    name: UnitText,
    label: string,
    extra: Partial<{ description: string; inputMode: "numeric"; onChange: () => void }> = {}
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={field.state.meta.errors.length > 0}>
          <FieldLabel htmlFor={`unit-${name}`}>
            {label}
            {name === "label" ? required : null}
          </FieldLabel>
          <Input
            id={`unit-${name}`}
            autoComplete="off"
            inputMode={extra.inputMode}
            required={name === "label"}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => {
              field.handleChange(event.target.value)
              extra.onChange?.()
            }}
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
            <DialogTitle>{unit ? `Edit ${unit.label}` : "Add unit"}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-6">
            <FieldSet className="gap-4">
              <FieldLegend className="sr-only">Address</FieldLegend>
              <form.Field name="street">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="unit-street">Street address</FieldLabel>
                    <AddressSearch
                      id="unit-street"
                      value={field.state.value}
                      onChange={(street) => {
                        field.handleChange(street)
                        // Typed by hand, it's no longer the place the search found.
                        form.setFieldValue("place", null)
                        nameFromAddress()
                      }}
                      onFind={({ parts, place }) => {
                        form.setFieldValue("street", parts.street)
                        form.setFieldValue("unitNumber", parts.unitNumber)
                        form.setFieldValue("city", parts.city)
                        form.setFieldValue("state", parts.state)
                        form.setFieldValue("postalCode", parts.postalCode)
                        form.setFieldValue("place", place)
                        nameFromAddress()
                      }}
                    />
                  </Field>
                )}
              </form.Field>
              {text("unitNumber", "Apt, suite or unit", { onChange: nameFromAddress })}
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem_6rem]">
                {text("city", "City")}
                <form.Field name="state">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="unit-state">State</FieldLabel>
                      <NativeSelect
                        id="unit-state"
                        className="w-full"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      >
                        <NativeSelectOption value="">Select</NativeSelectOption>
                        {/* One kept from before that isn't a state's code, so saving doesn't lose it. */}
                        {field.state.value && !usStates.some(([code]) => code === field.state.value) ? (
                          <NativeSelectOption value={field.state.value}>{field.state.value}</NativeSelectOption>
                        ) : null}
                        {usStates.map(([code, name]) => (
                          <NativeSelectOption key={code} value={code}>
                            {name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                </form.Field>
                {text("postalCode", "ZIP code", { inputMode: "numeric" })}
              </div>
            </FieldSet>
            {text("label", "Name", {
              description: "Defaults to the house number.",
              onChange: () => setNameTyped(true)
            })}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {unit ? "Save" : "Add unit"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const isRelation = (value: string): value is UnitRelation => unitRelations.some((relation) => relation === value)

/** Someone for the unit, from a day; a sale needs the day it sold. */
const linkSchema = (isSale: boolean) =>
  z
    .object({
      personId: z.string().min(1, "Pick someone."),
      relation: z.enum(unitRelations),
      day: z.union([z.literal(""), z.iso.date("Give a date.")])
    })
    .refine((value) => !isSale || value.day !== "", { message: "Give the day it sold.", path: ["day"] })

type UnitPeopleDialogProps = {
  unit: Unit
  /** "add" puts someone in the unit; "sale" moves its ownership to a buyer. */
  mode: "add" | "sale"
  people: readonly RollChoice[]
  onSave: (save: { personId: string; relation: UnitRelation; day: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds an owner, resident or tenant to a unit, or records its sale to a buyer. */
export function UnitPeopleDialog({ unit, mode, people, onSave, onOpenChange }: UnitPeopleDialogProps) {
  const isSale = mode === "sale"
  const form = useForm({
    defaultValues: { personId: "", relation: "owner" as UnitRelation, day: "" },
    validators: { onSubmit: linkSchema(isSale) },
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
            <DialogTitle>{isSale ? `Record sale of ${unit.label}` : `Add to ${unit.label}`}</DialogTitle>
            {isSale ? <DialogDescription>Add the buyer to the roll first.</DialogDescription> : null}
          </DialogHeader>
          <FieldGroup>
            <form.Field name="personId">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="unit-person">
                    {isSale ? "Buyer" : "Person"}
                    {required}
                  </FieldLabel>
                  <RollPicker
                    id="unit-person"
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
            {isSale ? null : (
              <form.Field name="relation">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="unit-relation">As</FieldLabel>
                    <NativeSelect
                      id="unit-relation"
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
            )}
            <form.Field name="day">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="unit-day">
                    {isSale ? "Sold on" : "Since"}
                    {isSale ? required : null}
                  </FieldLabel>
                  <Input
                    id="unit-day"
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
                  {isSale ? "Record sale" : "Add"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
