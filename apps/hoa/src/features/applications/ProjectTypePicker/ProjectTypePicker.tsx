import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { sentenceCase } from "@/lib/text"

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

/** The organization's project types as cards, each with what it covers, and "Something else". */
export function ProjectTypePicker({ types, value, onChange, errors }: ProjectTypePickerProps) {
  const options = [
    ...types,
    { id: somethingElse, label: "Something else", description: "A project the list doesn't name." }
  ]
  return (
    <FieldSet data-invalid={errors.length > 0}>
      <FieldLegend>What are you planning?</FieldLegend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(String(next))}
        aria-invalid={errors.length > 0}
        className="grid gap-3 sm:grid-cols-2"
      >
        {options.map((option) => (
          <FieldLabel key={option.id} htmlFor={`project-type-${option.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{sentenceCase(option.label)}</FieldTitle>
                {option.description ? (
                  <FieldDescription className="line-clamp-3">{sentenceCase(option.description)}</FieldDescription>
                ) : null}
              </FieldContent>
              <RadioGroupItem id={`project-type-${option.id}`} value={option.id} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <FieldError errors={[...errors]} />
    </FieldSet>
  )
}
