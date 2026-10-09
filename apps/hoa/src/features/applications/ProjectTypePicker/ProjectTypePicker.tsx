import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

/** The choice for a project no project type covers; parentheses can't appear in an id. */
export const somethingElse = "(something-else)"

export type ProjectTypeOption = { id: string; label: string; description: string | null }

export type ProjectTypePickerProps = {
  types: readonly ProjectTypeOption[]
  /** A type's id, `somethingElse`, or "" before a choice. */
  value: string
  onChange: (value: string) => void
  errors: readonly ({ message?: string } | undefined)[]
}

/** The organization's project types, each with what it covers, and "Something else". */
export function ProjectTypePicker({ types, value, onChange, errors }: ProjectTypePickerProps) {
  const options = [
    ...types,
    { id: somethingElse, label: "Something else", description: "A project the list doesn't name." }
  ]
  return (
    <FieldSet data-invalid={errors.length > 0}>
      <FieldLegend variant="label">Project type</FieldLegend>
      <RadioGroup value={value} onValueChange={(next) => onChange(String(next))} aria-invalid={errors.length > 0}>
        {options.map((option) => (
          <Field key={option.id} orientation="horizontal">
            <RadioGroupItem id={`project-type-${option.id}`} value={option.id} />
            <FieldContent>
              <FieldLabel htmlFor={`project-type-${option.id}`} className="font-normal">
                {option.label}
              </FieldLabel>
              {option.description ? <FieldDescription>{option.description}</FieldDescription> : null}
            </FieldContent>
          </Field>
        ))}
      </RadioGroup>
      <FieldError errors={[...errors]} />
    </FieldSet>
  )
}
