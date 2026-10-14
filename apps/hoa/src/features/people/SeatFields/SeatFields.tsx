import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChoiceSelect } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { withFieldGroup } from "@/lib/form"
import { committeeRoleChoices, type CommitteeMember, type SeatInput } from "@/people/people"
import { OfficePicker } from "../OfficePicker/OfficePicker"

/** A form's start for a seat: the term to correct, or a first one. */
export const seatValues = (member: CommitteeMember | null): SeatInput => ({
  role: member?.role ?? "member",
  office: member?.office ?? "",
  startedOn: member?.startedOn ?? "",
  termEndsOn: member?.termEndsOn ?? ""
})

/**
 * A term in a seat, in any form that seats someone or changes a term: chair or member, the office on the board, and
 * the days the term starts and is due to end.
 */
export const SeatFields = withFieldGroup({
  defaultValues: seatValues(null),
  props: { idPrefix: "seat", isBoard: false },
  render: function Render({ group, idPrefix, isBoard }) {
    const day = (name: "startedOn" | "termEndsOn", label: string) => (
      <group.Field name={name}>
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
            <Input
              id={`${idPrefix}-${name}`}
              type="date"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </group.Field>
    )
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <group.Field name="role">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-role`}>Role</FieldLabel>
              <ChoiceSelect
                id={`${idPrefix}-role`}
                className="w-full"
                value={field.state.value}
                choices={committeeRoleChoices}
                onChange={field.handleChange}
              />
            </Field>
          )}
        </group.Field>
        {isBoard ? (
          <group.Field name="office">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-office`}>Office</FieldLabel>
                <OfficePicker id={`${idPrefix}-office`} value={field.state.value} onChange={field.handleChange} />
              </Field>
            )}
          </group.Field>
        ) : (
          // Keeps the term's days side by side, under the role.
          <div aria-hidden className="hidden sm:block" />
        )}
        {day("startedOn", "Term start")}
        {day("termEndsOn", "Term end")}
      </div>
    )
  }
})
