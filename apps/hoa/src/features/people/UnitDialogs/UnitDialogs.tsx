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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
            <DialogTitle>{unit ? `Edit ${unit.label}` : "Add a unit"}</DialogTitle>
            <DialogDescription>A home, lot or condominium unit in the association.</DialogDescription>
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
      personId: z.string().min(1, "Pick someone on the roll."),
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
            <DialogTitle>{isSale ? `Record the sale of ${unit.label}` : `Add someone to ${unit.label}`}</DialogTitle>
            <DialogDescription>
              {isSale
                ? "Its owners stop owning it that day, and the buyer starts. Add the buyer to the roll first."
                : "An owner, someone who lives there, or a tenant."}
            </DialogDescription>
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
                    placeholder="Find someone on the roll"
                    empty="Nobody on the roll matches."
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

type RemoveFromUnitDialogProps = {
  unit: Unit
  /** Who's in the unit today: each link, with the person's name and how they hold it. */
  people: readonly { linkId: string; name: string; relation: UnitRelation }[]
  /** Today, where the viewer is, as the day it ends unless they pick another. */
  today: string
  onRemove: (remove: { linkId: string; endedOn: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Ends someone's ownership, residence or tenancy on a day: a move-out, or a former owner left on the roll. */
export function RemoveFromUnitDialog({ unit, people, today, onRemove, onOpenChange }: RemoveFromUnitDialogProps) {
  const form = useForm({
    defaultValues: { linkId: people.length === 1 ? (people[0]?.linkId ?? "") : "", endedOn: today },
    validators: {
      onSubmit: z.object({
        linkId: z.string().min(1, "Pick who."),
        endedOn: z.iso.date("Give a date.")
      })
    },
    onSubmit: async ({ value }) => {
      await onRemove(value)
      onOpenChange(false)
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
            <DialogTitle>Remove someone from {unit.label}</DialogTitle>
            <DialogDescription>They stay on the roll, with their history.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="linkId">
              {(field) => (
                <FieldSet data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLegend variant="label">Who{required}</FieldLegend>
                  <RadioGroup className="gap-2" value={field.state.value} onValueChange={field.handleChange}>
                    {people.map((person) => (
                      <FieldLabel key={person.linkId} htmlFor={`remove-${person.linkId}`}>
                        <Field orientation="horizontal" className="items-center gap-3 py-2.5!">
                          <RadioGroupItem id={`remove-${person.linkId}`} value={person.linkId} />
                          <FieldContent className="gap-0.5">
                            <FieldTitle className="font-normal">{person.name}</FieldTitle>
                            <FieldDescription className="text-xs">{relationLabels[person.relation]}</FieldDescription>
                          </FieldContent>
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                  <FieldError errors={field.state.meta.errors} />
                </FieldSet>
              )}
            </form.Field>
            <form.Field name="endedOn">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="remove-day">
                    Ends on
                    {required}
                  </FieldLabel>
                  <Input
                    id="remove-day"
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
                <Button type="submit" variant="destructive" disabled={isSubmitting}>
                  Remove
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
