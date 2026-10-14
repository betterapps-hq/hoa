import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { personInputSchema, relationLabels, unitRelations, type Person, type UnitRelation } from "@/people/people"
import { phoneText } from "@/people/phone"
import { RollPicker, type RollChoice } from "../RollPicker/RollPicker"

export type PersonSave = {
  person: { name: string; email: string; phone: string; mailingAddress: string; access: Person["access"] }
  /** For someone new: the unit they own, live in or rent, if any. */
  home: { unitId: string; relation: UnitRelation } | null
}

type PersonDialogProps = {
  /** The person to edit; null to add someone. */
  person: Person | null
  units: readonly RollChoice[]
  onSave: (save: PersonSave) => Promise<void>
  onOpenChange: (open: boolean) => void
}

const isRelation = (value: string): value is UnitRelation => unitRelations.some((relation) => relation === value)

const formSchema = personInputSchema
  .omit({ access: true })
  .extend({ isAdministrator: z.boolean(), unitId: z.string(), relation: z.enum(unitRelations) })

/** Adds someone to the roll, with the unit they live in, or edits them. */
export function PersonDialog({ person, units, onSave, onOpenChange }: PersonDialogProps) {
  const form = useForm({
    defaultValues: {
      name: person?.name ?? "",
      email: person?.email ?? "",
      phone: person?.phone ? phoneText(person.phone) : "",
      mailingAddress: person?.mailingAddress ?? "",
      isAdministrator: person?.access === "administrator",
      unitId: "",
      relation: "owner" as UnitRelation
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
        home: !person && value.unitId ? { unitId: value.unitId, relation: value.relation } : null
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
            <DialogTitle>{person ? `Edit ${person.name}` : "Add a person"}</DialogTitle>
            <DialogDescription>
              {person
                ? "A new email lets go of the account the old one signed in with."
                : "With their email on the roll, they can sign in and see their home."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {text("name", "Name", { required: true })}
            {text("email", "Email", { type: "email", description: "How they sign in." })}
            {text("phone", "Phone", { type: "tel" })}
            {text("mailingAddress", "Mailing address", { description: "Only when mail doesn't go to their unit." })}
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
                    <FieldDescription>Manages the association here: people, rules and applications.</FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
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
