import { CheckIcon, Trash2Icon, XIcon } from "lucide-react"
import { useId } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { projectTypes, ruleKindLabels, ruleKinds } from "@/rules/rules"
import { decisions, type Decision, type EditorValues } from "../RulebookEditor/RulebookEditor.utils"

export type RuleCardProps = {
  index: number
  documents: string[]
  onRemove: () => void
}

const decisionStyles: Record<Decision, string> = {
  pending: "",
  approved: "",
  rejected: "opacity-60"
}

function isDecision(value: unknown): value is Decision {
  return decisions.some((decision) => decision === value)
}

/** One extracted rule: editable fields, its source citation and the approve or reject decision. */
export function RuleCard({ index, documents, onRemove }: RuleCardProps) {
  const id = useId()
  const {
    register,
    control,
    formState: { errors }
  } = useFormContext<EditorValues>()
  const decision = useWatch({ control, name: `rules.${index}.decision` })
  const title = useWatch({ control, name: `rules.${index}.title` })
  const ruleErrors = errors.rules?.[index]
  const field = (name: string) => `${id}-${name}`

  return (
    <Card className={cn("transition-opacity", decisionStyles[decision])}>
      <CardContent>
        <FieldSet>
          <FieldLegend>{title || `Rule ${index + 1}`}</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <Field data-invalid={Boolean(ruleErrors?.title)}>
                <FieldLabel htmlFor={field("title")}>Title</FieldLabel>
                <Input
                  id={field("title")}
                  aria-invalid={Boolean(ruleErrors?.title)}
                  {...register(`rules.${index}.title`)}
                />
                <FieldError errors={[ruleErrors?.title]} />
              </Field>
              <Field>
                <FieldLabel htmlFor={field("kind")}>Kind</FieldLabel>
                <NativeSelect id={field("kind")} className="w-full" {...register(`rules.${index}.kind`)}>
                  {ruleKinds.map((kind) => (
                    <NativeSelectOption key={kind} value={kind}>
                      {ruleKindLabels[kind]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field data-invalid={Boolean(ruleErrors?.requirement)}>
              <FieldLabel htmlFor={field("requirement")}>Requirement</FieldLabel>
              <Textarea
                id={field("requirement")}
                rows={3}
                aria-invalid={Boolean(ruleErrors?.requirement)}
                {...register(`rules.${index}.requirement`)}
              />
              <FieldError errors={[ruleErrors?.requirement]} />
            </Field>

            <Controller
              control={control}
              name={`rules.${index}.projectTypes`}
              render={({ field: { value, onChange } }) => (
                <FieldSet>
                  <FieldLegend variant="label">Applies to</FieldLegend>
                  <div className="flex flex-wrap gap-4">
                    {projectTypes.map((type) => (
                      <Field key={type.id} orientation="horizontal" className="w-auto">
                        <Checkbox
                          id={field(`type-${type.id}`)}
                          checked={value.includes(type.id)}
                          onCheckedChange={(isChecked) =>
                            onChange(isChecked ? [...value, type.id] : value.filter((existing) => existing !== type.id))
                          }
                        />
                        <FieldLabel htmlFor={field(`type-${type.id}`)} className="font-normal">
                          {type.label}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                  <FieldError errors={[ruleErrors?.projectTypes]} />
                </FieldSet>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-[1fr_10rem_6rem]">
              <Field>
                <FieldLabel htmlFor={field("document")}>Source document</FieldLabel>
                <NativeSelect id={field("document")} className="w-full" {...register(`rules.${index}.source.document`)}>
                  {documents.map((document) => (
                    <NativeSelectOption key={document} value={document}>
                      {document}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field data-invalid={Boolean(ruleErrors?.source?.section)}>
                <FieldLabel htmlFor={field("section")}>Section</FieldLabel>
                <Input
                  id={field("section")}
                  aria-invalid={Boolean(ruleErrors?.source?.section)}
                  {...register(`rules.${index}.source.section`)}
                />
                <FieldError errors={[ruleErrors?.source?.section]} />
              </Field>
              <Field>
                <FieldLabel htmlFor={field("page")}>Page</FieldLabel>
                <Input
                  id={field("page")}
                  inputMode="numeric"
                  {...register(`rules.${index}.source.page`, {
                    setValueAs: (value: unknown) =>
                      value === "" || value === null || value === undefined ? null : Number(value)
                  })}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={field("quote")}>Supporting quote</FieldLabel>
              <Textarea id={field("quote")} rows={2} {...register(`rules.${index}.source.quote`)} />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Controller
                control={control}
                name={`rules.${index}.decision`}
                render={({ field: { value, onChange } }) => (
                  <ToggleGroup
                    aria-label="Decision"
                    variant="outline"
                    value={[value]}
                    onValueChange={(next) => {
                      const selected = next.at(-1)
                      if (isDecision(selected)) {
                        onChange(selected)
                      }
                    }}
                  >
                    <ToggleGroupItem value="approved">
                      <CheckIcon />
                      Approve
                    </ToggleGroupItem>
                    <ToggleGroupItem value="rejected">
                      <XIcon />
                      Reject
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
              <Button variant="ghost" onClick={onRemove}>
                <Trash2Icon />
                Delete rule
              </Button>
            </div>
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  )
}
