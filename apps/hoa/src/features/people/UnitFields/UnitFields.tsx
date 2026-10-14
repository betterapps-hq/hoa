import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { withFieldGroup } from "@/lib/form"
import type { Unit, UnitInput } from "@/people/people"
import { unitNameFrom, usStates } from "@/places/address"
import { AddressSearch } from "../AddressSearch/AddressSearch"

/** A form's start for a unit: the one to edit, or a new one from the street typed so far. */
export const unitValues = (unit: Unit | null, street = ""): UnitInput => ({
  street: unit?.street ?? street,
  unitNumber: unit?.unitNumber ?? "",
  city: unit?.city ?? "",
  state: unit?.state ?? "",
  postalCode: unit?.postalCode ?? "",
  label: unit?.label ?? unitNameFrom(street, ""),
  place: unit?.place ?? null
})

type UnitText = "unitNumber" | "city" | "postalCode" | "label"

/**
 * A unit's address, then its name, in any form that adds or edits one. Picking an address the search suggests fills
 * its unit number, city, state and ZIP code, and the name follows the house number until someone types another.
 */
export const UnitFields = withFieldGroup({
  defaultValues: unitValues(null),
  props: { idPrefix: "unit" },
  render: function Render({ group, idPrefix }) {
    /** Changes the address, and the name with it while the name is still the one the address gave. */
    const changeAddress = (change: () => void) => {
      const nameFromAddress = () => unitNameFrom(group.getFieldValue("street"), group.getFieldValue("unitNumber"))
      const isNameFollowing = group.getFieldValue("label") === nameFromAddress()
      change()
      if (isNameFollowing) {
        group.setFieldValue("label", nameFromAddress())
      }
    }
    const text = (
      name: UnitText,
      label: string,
      extra: Partial<{ description: string; inputMode: "numeric"; isAddress: boolean }> = {}
    ) => (
      <group.Field name={name}>
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={`${idPrefix}-${name}`}>
              {label}
              {name === "label" ? <RequiredMark /> : null}
            </FieldLabel>
            <Input
              id={`${idPrefix}-${name}`}
              autoComplete="off"
              inputMode={extra.inputMode}
              required={name === "label"}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                const { value } = event.target
                if (extra.isAddress) {
                  changeAddress(() => field.handleChange(value))
                } else {
                  field.handleChange(value)
                }
              }}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {extra.description ? <FieldDescription>{extra.description}</FieldDescription> : null}
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </group.Field>
    )
    return (
      <>
        <FieldSet className="gap-4">
          <FieldLegend className="sr-only">Address</FieldLegend>
          <group.Field name="street">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-street`}>Street address</FieldLabel>
                <AddressSearch
                  id={`${idPrefix}-street`}
                  value={field.state.value}
                  onChange={(street) =>
                    changeAddress(() => {
                      field.handleChange(street)
                      // Typed by hand, it's no longer the place the search found.
                      group.setFieldValue("place", null)
                    })
                  }
                  onFind={({ parts, place }) =>
                    changeAddress(() => {
                      group.setFieldValue("street", parts.street)
                      group.setFieldValue("unitNumber", parts.unitNumber)
                      group.setFieldValue("city", parts.city)
                      group.setFieldValue("state", parts.state)
                      group.setFieldValue("postalCode", parts.postalCode)
                      group.setFieldValue("place", place)
                    })
                  }
                />
              </Field>
            )}
          </group.Field>
          {text("unitNumber", "Apt, suite or unit", { isAddress: true })}
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_6rem]">
            {text("city", "City")}
            <group.Field name="state">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-state`}>State</FieldLabel>
                  <NativeSelect
                    id={`${idPrefix}-state`}
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
            </group.Field>
            {text("postalCode", "ZIP code", { inputMode: "numeric" })}
          </div>
        </FieldSet>
        {text("label", "Name", { description: "Defaults to the house number." })}
      </>
    )
  }
})
