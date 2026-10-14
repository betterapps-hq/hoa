import { useForm } from "@tanstack/react-form"
import { z } from "zod"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChoiceSelect } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { useAppForm } from "@/lib/form"
import {
  relationChoices,
  unitInputSchema,
  unitRelations,
  type Unit,
  type UnitInput,
  type UnitRelation
} from "@/people/people"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"
import { UnitFields, unitValues } from "../UnitFields/UnitFields"

type UnitDialogProps = {
  /** The unit to edit; null to add one. */
  unit: Unit | null
  onSave: (unit: UnitInput) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds a unit to the roll or edits one. */
export function UnitDialog({ unit, onSave, onOpenChange }: UnitDialogProps) {
  const form = useAppForm({
    defaultValues: { unit: unitValues(unit) },
    validators: { onSubmit: z.object({ unit: unitInputSchema }) },
    onSubmit: async ({ value }) => {
      await onSave(value.unit)
      onOpenChange(false)
    }
  })
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
            <UnitFields form={form} fields="unit" idPrefix="unit" />
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
                    <RequiredMark />
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
                    <ChoiceSelect
                      id="unit-relation"
                      className="w-full"
                      value={field.state.value}
                      choices={relationChoices}
                      onChange={field.handleChange}
                    />
                  </Field>
                )}
              </form.Field>
            )}
            <form.Field name="day">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="unit-day">
                    {isSale ? "Sold on" : "Since"}
                    {isSale ? <RequiredMark /> : null}
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
