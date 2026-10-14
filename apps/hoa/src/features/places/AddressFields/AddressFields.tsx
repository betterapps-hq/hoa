import { PlusIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { withFieldGroup } from "@/lib/form"
import { addressValues, isEmptyAddress, usStates } from "@/places/address"
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

/** The legend's room below it: close above a description, hidden but for screen readers without a legend. */
function legendClass(legend: string | undefined, description: string | undefined) {
  if (!legend) {
    return "sr-only"
  }
  return description ? "mb-1" : "mb-3"
}

/**
 * An address in parts, in any form that keeps one: the street, found by the address search or typed, then the
 * apartment, suite or unit, the city, a state and the ZIP code. Picking a suggested address fills the rest.
 *
 * Given `addLabel`, the address is one someone may leave out, such as a mailing address: until it has something in it,
 * it's a button that opens its fields, and removing it empties them.
 */
export const AddressFields = withFieldGroup({
  defaultValues: addressValues(null),
  props: {} as {
    idPrefix: string
    /** Shown above the fields; screen readers alone hear "Address" without it. */
    legend?: string
    description?: string
    /** The button's label for an address someone may leave out: "Add a mailing address". */
    addLabel?: string
    /** Runs each change to the address, for a form that follows along, as a unit's name follows its house number. */
    onAddressChange?: (change: () => void) => void
  },
  render: function Render({
    group,
    idPrefix,
    legend,
    description,
    addLabel,
    onAddressChange = (change: () => void) => change()
  }) {
    const [isAdding, setAdding] = useState(false)
    const fields = useRef<HTMLFieldSetElement>(null)
    // Opened to add one, it's ready to type the street.
    useEffect(() => {
      if (isAdding) {
        fields.current?.querySelector("input")?.focus()
      }
    }, [isAdding])
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
    const remove = () =>
      onAddressChange(() => {
        const empty = addressValues(null)
        group.setFieldValue("street", empty.street)
        group.setFieldValue("unitNumber", empty.unitNumber)
        group.setFieldValue("city", empty.city)
        group.setFieldValue("state", empty.state)
        group.setFieldValue("postalCode", empty.postalCode)
        group.setFieldValue("place", null)
        setAdding(false)
      })
    return (
      <group.Subscribe
        selector={(state) => ({ isEmpty: isEmptyAddress(state.values), isFound: state.values.place !== null })}
      >
        {({ isEmpty, isFound }) =>
          addLabel && isEmpty && !isAdding ? (
            <Field>
              {legend ? <FieldTitle id={`${idPrefix}-title`}>{legend}</FieldTitle> : null}
              <Button
                type="button"
                aria-describedby={legend ? `${idPrefix}-title` : undefined}
                variant="outline"
                className="w-full justify-start border-dashed text-muted-foreground"
                onClick={() => setAdding(true)}
              >
                <PlusIcon data-icon="inline-start" />
                {addLabel}
              </Button>
              {description ? <FieldDescription>{description}</FieldDescription> : null}
            </Field>
          ) : (
            <FieldSet ref={fields} className="gap-4">
              <FieldLegend variant="label" className={legendClass(legend, description)}>
                {legend ?? "Address"}
              </FieldLegend>
              {legend && description ? <FieldDescription>{description}</FieldDescription> : null}
              <group.Field name="street">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-street`}>Street address</FieldLabel>
                    <AddressSearch
                      id={`${idPrefix}-street`}
                      value={field.state.value}
                      isFound={isFound}
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
              {addLabel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start text-muted-foreground"
                  onClick={remove}
                >
                  <XIcon data-icon="inline-start" />
                  Remove {legend ? legend.toLowerCase() : "address"}
                </Button>
              ) : null}
            </FieldSet>
          )
        }
      </group.Subscribe>
    )
  }
})
