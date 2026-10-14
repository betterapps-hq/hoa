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
import { relationLabels, unitInputSchema, unitRelations, type Unit, type UnitRelation } from "@/people/people"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"

const required = (
  <span aria-hidden className="ml-0.5 text-destructive">
    *
  </span>
)

type UnitDialogProps = {
  /** The unit to edit; null to add one. */
  unit: Unit | null
  onSave: (unit: { label: string; address: string; lot: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds a unit to the roll or edits one. */
export function UnitDialog({ unit, onSave, onOpenChange }: UnitDialogProps) {
  const form = useForm({
    defaultValues: { label: unit?.label ?? "", lot: unit?.lot ?? "", address: unit?.address ?? "" },
    validators: { onSubmit: unitInputSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
      onOpenChange(false)
    }
  })
  const text = (name: "label" | "lot" | "address", label: string, description?: string) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={field.state.meta.errors.length > 0}>
          <FieldLabel htmlFor={`unit-${name}`}>
            {label}
            {name === "label" ? required : null}
          </FieldLabel>
          <Input
            id={`unit-${name}`}
            required={name === "label"}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            aria-invalid={field.state.meta.errors.length > 0}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )
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
            <DialogTitle>{unit ? `Edit ${unit.label}` : "Add unit"}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {text("label", "Name", "What the association calls it: a street address, or a lot or unit number.")}
            {text("lot", "Lot")}
            {text("address", "Full address", "With the city and ZIP code, for mail and the map.")}
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
