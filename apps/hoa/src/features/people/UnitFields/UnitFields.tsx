import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AddressFields, addressFieldMap } from "@/features/places/AddressFields/AddressFields"
import { withFieldGroup } from "@/lib/form"
import type { Unit, UnitInput } from "@/people/people"
import { addressValues, unitNameFrom } from "@/places/address"

/** A form's start for a unit: the one to edit, or a new one from the street typed so far. */
export const unitValues = (unit: Unit | null, street = ""): UnitInput => ({
  ...addressValues(unit, street),
  label: unit?.label ?? unitNameFrom(street, "")
})

/**
 * A unit's address, then its name, in any form that adds or edits one. The name follows the house number until
 * someone types another.
 */
export const UnitFields = withFieldGroup({
  defaultValues: unitValues(null),
  props: { idPrefix: "unit" },
  render: function Render({ group, idPrefix }) {
    /** Changes the address, and the name with it while the name is still the one the address gave. */
    const followAddress = (change: () => void) => {
      const nameFromAddress = () => unitNameFrom(group.getFieldValue("street"), group.getFieldValue("unitNumber"))
      const isNameFollowing = group.getFieldValue("label") === nameFromAddress()
      change()
      if (isNameFollowing) {
        group.setFieldValue("label", nameFromAddress())
      }
    }
    return (
      <>
        <AddressFields form={group} fields={addressFieldMap} idPrefix={idPrefix} onAddressChange={followAddress} />
        <group.Field name="label">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${idPrefix}-label`}>
                Name
                <RequiredMark />
              </FieldLabel>
              <Input
                id={`${idPrefix}-label`}
                autoComplete="off"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              <FieldDescription>Defaults to the house number.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </group.Field>
      </>
    )
  }
})
