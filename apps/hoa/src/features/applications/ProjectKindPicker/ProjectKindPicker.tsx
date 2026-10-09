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
import type { ProjectKindOption } from "../applicationView"

/** The choice for a project the rulebook's kinds don't name; parentheses can't appear in a term key. */
export const somethingElse = "(something-else)"

export type ProjectKindPickerProps = {
  kinds: readonly ProjectKindOption[]
  /** A kind's key, `somethingElse`, or "" before a choice. */
  value: string
  onChange: (value: string) => void
  errors: readonly ({ message?: string } | undefined)[]
}

/** The rulebook's project kinds, each with what the rulebook says it covers, and "Something else". */
export function ProjectKindPicker({ kinds, value, onChange, errors }: ProjectKindPickerProps) {
  const options = [
    ...kinds,
    { key: somethingElse, label: "Something else", description: "A project the list doesn't name." }
  ]
  return (
    <FieldSet data-invalid={errors.length > 0}>
      <FieldLegend variant="label">Project type</FieldLegend>
      <RadioGroup value={value} onValueChange={(next) => onChange(String(next))} aria-invalid={errors.length > 0}>
        {options.map((option) => (
          <Field key={option.key} orientation="horizontal">
            <RadioGroupItem id={`project-kind-${option.key}`} value={option.key} />
            <FieldContent>
              <FieldLabel htmlFor={`project-kind-${option.key}`} className="font-normal">
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
