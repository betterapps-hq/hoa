import { PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { blankItem } from "@/projectTypes/answers"
import type {
  AnswerValue,
  ProjectAnswers,
  ProjectField,
  ProjectGroup,
  ProjectTypeDefinition
} from "@/projectTypes/projectType"

// The form a project type defines (application-review.md, Project types), rendered from its definition: one input per
// field kind, and groups the homeowner can repeat (several of the same item). Validation is the definition's own Zod
// schema (answersSchema); its issues come back by path.

export type AnswerIssue = { path: readonly PropertyKey[]; message: string }

export type ProjectFormProps = {
  definition: ProjectTypeDefinition
  value: ProjectAnswers
  onChange: (value: ProjectAnswers) => void
  issues: readonly AnswerIssue[]
}

const otherChoice = "(other)"

type ChoiceField = Extract<ProjectField, { kind: "choice" }>

/** A yes-or-no answer as the radio group's value: "" before an answer. */
function yesNoValue(value: AnswerValue) {
  if (value === null) {
    return ""
  }
  return value ? "yes" : "no"
}

const issuesAt = (issues: readonly AnswerIssue[], subject: string, index: number, property: string) =>
  issues
    .filter((issue) => issue.path[0] === subject && issue.path[1] === index && issue.path[2] === property)
    .map((issue) => ({ message: issue.message }))

type FieldInputProps = {
  field: ProjectField
  id: string
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  isInvalid: boolean
}

function FieldInput({ field, id, value, onChange, isInvalid }: FieldInputProps) {
  const text = value === null || typeof value === "boolean" ? "" : String(value)
  switch (field.kind) {
    case "long-text":
      return (
        <Textarea id={id} value={text} onChange={(event) => onChange(event.target.value)} aria-invalid={isInvalid} />
      )
    case "number": {
      const input = (
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={text}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
          aria-invalid={isInvalid}
        />
      )
      return (
        <InputGroup>
          {input}
          {field.unit ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText>{field.unit.label}</InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      )
    }
    case "choice":
      return <ChoiceInput field={field} id={id} value={value} onChange={onChange} isInvalid={isInvalid} />
    case "yes-no":
      return (
        <RadioGroup
          value={yesNoValue(value)}
          onValueChange={(next) => onChange(next === "yes")}
          aria-labelledby={`${id}-label`}
          aria-invalid={isInvalid}
          className="flex gap-6"
        >
          {(["yes", "no"] as const).map((choice) => (
            <Field key={choice} orientation="horizontal" className="w-auto">
              <RadioGroupItem id={`${id}-${choice}`} value={choice} />
              <FieldLabel htmlFor={`${id}-${choice}`} className="font-normal">
                {choice === "yes" ? "Yes" : "No"}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      )
    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={text}
          onChange={(event) => onChange(event.target.value || null)}
          aria-invalid={isInvalid}
        />
      )
    default:
      return <Input id={id} value={text} onChange={(event) => onChange(event.target.value)} aria-invalid={isInvalid} />
  }
}

function ChoiceInput({ field, id, value, onChange, isInvalid }: FieldInputProps & { field: ChoiceField }) {
  const text = typeof value === "string" ? value : ""
  const isListed = field.options.some((option) => option.value === value)
  const [isOther, setIsOther] = useState(field.allowsOther && !isListed && text !== "")
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        id={id}
        value={isOther ? otherChoice : text}
        onChange={(event) => {
          const next = event.target.value
          setIsOther(next === otherChoice)
          onChange(next === otherChoice || next === "" ? null : next)
        }}
        aria-invalid={isInvalid}
      >
        <NativeSelectOption value="">Not chosen</NativeSelectOption>
        {field.options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
        {field.allowsOther ? <NativeSelectOption value={otherChoice}>Something else</NativeSelectOption> : null}
      </NativeSelect>
      {isOther ? (
        <Input
          aria-label={`${field.label}, in your words`}
          value={text}
          onChange={(event) => onChange(event.target.value || null)}
        />
      ) : null}
    </div>
  )
}

type GroupProps = {
  group: ProjectGroup
  items: readonly Record<string, AnswerValue>[]
  onChange: (items: Record<string, AnswerValue>[]) => void
  issues: readonly AnswerIssue[]
}

function ProjectGroupFields({ group, items, onChange, issues }: GroupProps) {
  const setValue = (index: number, property: string, value: AnswerValue) =>
    onChange(items.map((item, at) => (at === index ? { ...item, [property]: value } : item)))
  return (
    <FieldSet>
      <FieldLegend>{group.label}</FieldLegend>
      {group.help ? <FieldDescription>{group.help}</FieldDescription> : null}
      {items.map((item, index) => {
        const name = group.isRepeatable ? `${group.itemLabel} ${index + 1}` : null
        return (
          // Items are positional: removing one renumbers the rest, so the index is their identity.
          <div key={index} className={name ? "flex flex-col gap-4 rounded-lg border p-4" : "flex flex-col gap-4"}>
            {name ? (
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium">{name}</h4>
                {items.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${name}`}
                    onClick={() => onChange(items.filter((_, at) => at !== index))}
                  >
                    <XIcon />
                    Remove
                  </Button>
                ) : null}
              </div>
            ) : null}
            <FieldGroup>
              {group.fields.map((field) => {
                const id = `answer-${group.subject}-${index}-${field.property}`
                const errors = issuesAt(issues, group.subject, index, field.property)
                return (
                  <Field key={field.property} data-invalid={errors.length > 0}>
                    <FieldContent>
                      <FieldLabel htmlFor={id} id={`${id}-label`}>
                        {field.label}
                        {field.isRequired ? null : <span className="font-normal text-muted-foreground">Optional</span>}
                      </FieldLabel>
                      {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
                    </FieldContent>
                    <FieldInput
                      field={field}
                      id={id}
                      value={item[field.property] ?? null}
                      onChange={(value) => setValue(index, field.property, value)}
                      isInvalid={errors.length > 0}
                    />
                    <FieldError errors={errors} />
                  </Field>
                )
              })}
            </FieldGroup>
          </div>
        )
      })}
      {group.isRepeatable ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => onChange([...items, blankItem(group)])}
        >
          <PlusIcon />
          Add another {group.itemLabel.toLowerCase()}
        </Button>
      ) : null}
    </FieldSet>
  )
}

/** The project type's questions, group by group. */
export function ProjectForm({ definition, value, onChange, issues }: ProjectFormProps) {
  return (
    <div className="flex flex-col gap-6">
      {definition.groups.map((group) => (
        <ProjectGroupFields
          key={group.subject}
          group={group}
          items={value[group.subject] ?? [blankItem(group)]}
          onChange={(items) => onChange({ ...value, [group.subject]: items })}
          issues={issues}
        />
      ))}
    </div>
  )
}
