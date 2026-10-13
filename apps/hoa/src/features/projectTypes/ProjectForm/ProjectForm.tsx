import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { sentenceCase } from "@/lib/text"
import { answerErrors, blankItem, isSharedIn, nextItem } from "@/projectTypes/answers"
import type {
  AnswerValue,
  ProjectAnswers,
  ProjectField,
  ProjectGroup,
  ProjectTypeDefinition
} from "@/projectTypes/projectType"
import type { QuestionReasons } from "../offeredTypes"
import { QuestionField } from "../QuestionField/QuestionField"

// The form a project type defines (application-review.md, Project types), rendered from its definition: a section per
// group, in the administrator's order, and items the homeowner can add and remove where a group repeats. There, the
// questions asked once for every item come first, and each answer is kept on every item, so the review reads each item
// whole. Each answer is checked by the definition's own schema (answerErrors) once its question is left, or for all
// after a submit.

export type ProjectFormProps = {
  definition: ProjectTypeDefinition
  value: ProjectAnswers
  onChange: (value: ProjectAnswers) => void
  /** After a submit attempt: show every answer's problems, not only those of questions left. */
  showsAllErrors: boolean
  /** Why each question is asked, behind its info button. */
  reasons?: QuestionReasons
}

type GroupProps = {
  group: ProjectGroup
  items: readonly Record<string, AnswerValue>[]
  onChange: (items: Record<string, AnswerValue>[]) => void
  showsAllErrors: boolean
  reasons: QuestionReasons | undefined
}

function ProjectGroupFields({ group, items, onChange, showsAllErrors, reasons }: GroupProps) {
  // Each item keeps an identity of its own, so removing one doesn't hand its inputs to the next.
  const [ids, setIds] = useState(() => items.map((_, index) => index))
  const [nextId, setNextId] = useState(items.length)
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const shared = group.fields.filter((field) => isSharedIn(group, field))
  const own = group.fields.filter((field) => !isSharedIn(group, field))
  /** Sets one item's answer, or, for a question asked once (no index), every item's. */
  const setValue = (index: number | null, property: string, value: AnswerValue) =>
    onChange(items.map((item, at) => (index === null || at === index ? { ...item, [property]: value } : item)))
  const add = () => {
    setIds([...ids, nextId])
    setNextId(nextId + 1)
    onChange([...items, nextItem(group, items)])
  }
  const remove = (index: number) => {
    setIds(ids.filter((_, at) => at !== index))
    onChange(items.filter((_, at) => at !== index))
  }
  const question = (field: ProjectField, item: Record<string, AnswerValue>, index: number | null, key: string) => {
    const fieldId = `answer-${group.subject}-${key}-${field.property}`
    const value = item[field.property] ?? null
    const shows = showsAllErrors || left.has(fieldId)
    return (
      <QuestionField
        key={field.property}
        field={field}
        id={fieldId}
        value={value}
        onChange={(next) => setValue(index, field.property, next)}
        onBlur={() => setLeft(new Set([...left, fieldId]))}
        errors={shows ? answerErrors(field, value) : []}
        reasons={
          reasons && {
            rules: field.binding ? (reasons.rules[field.binding] ?? []) : [],
            citations: (field.citations ?? []).flatMap((citation) => reasons.citations[citation] ?? [])
          }
        }
      />
    )
  }
  const itemName = group.itemLabel.toLowerCase()
  return (
    <FieldSet className="min-w-0 gap-4">
      <FieldLegend className="mb-0">{sentenceCase(group.label)}</FieldLegend>
      {group.help ? <FieldDescription className="-mt-3">{group.help}</FieldDescription> : null}
      {shared.length > 0 ? (
        <section aria-label={`Every ${itemName}`} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">Every {itemName}</h4>
            <p className="text-sm text-muted-foreground">Answer these once for all of them.</p>
          </div>
          <FieldGroup className="gap-5">
            {shared.map((field) => question(field, items[0] ?? {}, null, "every"))}
          </FieldGroup>
        </section>
      ) : null}
      {items.map((item, index) => {
        const id = ids[index] ?? index
        const name = group.isRepeatable ? `${group.itemLabel} ${index + 1}` : null
        const fields =
          own.length > 0 ? (
            <FieldGroup className="gap-5">{own.map((field) => question(field, item, index, String(id)))}</FieldGroup>
          ) : null
        return name ? (
          <section key={id} aria-label={name} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{name}</h4>
              {items.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name.toLowerCase()}`}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
            {fields}
          </section>
        ) : (
          <div key={id}>{fields}</div>
        )
      })}
      {group.isRepeatable ? (
        <Button type="button" variant="outline" className="self-start" onClick={add}>
          <PlusIcon />
          Add {itemName}
        </Button>
      ) : null}
    </FieldSet>
  )
}

/** The project type's questions, section by section. */
export function ProjectForm({ definition, value, onChange, showsAllErrors, reasons }: ProjectFormProps) {
  return (
    <div className="flex flex-col gap-8">
      {definition.groups.map((group) => (
        <ProjectGroupFields
          key={group.subject}
          group={group}
          items={value[group.subject] ?? [blankItem(group)]}
          onChange={(items) => onChange({ ...value, [group.subject]: items })}
          showsAllErrors={showsAllErrors}
          reasons={reasons}
        />
      ))}
    </div>
  )
}
