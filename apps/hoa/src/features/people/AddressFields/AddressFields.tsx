import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { withFieldGroup } from "@/lib/form"
import { addressValues, usStates } from "@/places/address"
import { AddressSearch } from "../AddressSearch/AddressSearch"

/** The address's fields by their own names, for a form that keeps them beside its others, as a unit's form does. */
export const addressFieldMap = {
  street: "street",
  unitNumber: "unitNumber",
  city: "city",
  state: "state",
  postalCode: "postalCode",
  place: "place"
} as const

/**
 * An address in parts, in any form that keeps one: the street, found by the address search or typed, then the
 * apartment, suite or unit, the city, a state and the ZIP code. Picking a suggested address fills the rest.
 */
export const AddressFields = withFieldGroup({
  defaultValues: addressValues(null),
  props: {
    idPrefix: "address",
    /** Runs each change to the address, for a form that follows along, as a unit's name follows its house number. */
    onAddressChange: (change: () => void) => change()
  },
  render: function Render({ group, idPrefix, onAddressChange }) {
    const text = (name: "unitNumber" | "city" | "postalCode", label: string, inputMode?: "numeric") => (
      <group.Field name={name}>
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
            <Input
              id={`${idPrefix}-${name}`}
              autoComplete="off"
              inputMode={inputMode}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                const { value } = event.target
                if (name === "unitNumber") {
                  onAddressChange(() => field.handleChange(value))
                } else {
                  field.handleChange(value)
                }
              }}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </group.Field>
    )
    return (
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
                  onAddressChange(() => {
                    field.handleChange(street)
                    // Typed by hand, it's no longer the place the search found.
                    group.setFieldValue("place", null)
                  })
                }
                onFind={({ parts, place }) =>
                  onAddressChange(() => {
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
        {text("unitNumber", "Apt, suite or unit")}
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
          {text("postalCode", "ZIP code", "numeric")}
        </div>
      </FieldSet>
    )
  }
})
