import { AsteriskIcon, CircleDashedIcon, ListPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { RowActions } from "@/components/RowActions/RowActions"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { sentenceCase } from "@/lib/text"
import {
  addDocument,
  addQuestion,
  allQuestions,
  candidateQuestions,
  customKey,
  moveQuestion,
  removeQuestion,
  sectionsOf,
  updateQuestion
} from "@/projectTypes/definition"
import type { AnswerValue, ProjectField, ProjectGroup, ProjectTypeDefinition } from "@/projectTypes/projectType"
import { asSentence } from "@/projectTypes/wording"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { PickerDialog, type PickerOption } from "../PickerDialog/PickerDialog"
import type { QuestionInfo, VocabularyUnit } from "../projectTypes.functions"
import { QuestionDialog } from "../QuestionDialog/QuestionDialog"
import { QuestionField } from "../QuestionField/QuestionField"
import { RuleCitations } from "../RuleCitations/RuleCitations"
import { SortableList } from "../SortableList/SortableList"

// A project type's questions as the administrator edits them (application-review.md, Project types): each question
// rendered exactly as homeowners see it (the preview takes answers but never keeps them), its one info button holding
// its help and what it checks, its citations under it, a handle to drag it and a menu for the rest. "Add question"
// suggests what the rules check that the form doesn't ask, and always lets the administrator write their own.

export type DefinitionUpdate = (change: (current: ProjectTypeDefinition) => ProjectTypeDefinition) => void

export type QuestionsCardProps = {
  definition: ProjectTypeDefinition
  /** Every question the rules can ask, for suggesting. */
  available: ProjectTypeDefinition
  info: Readonly<Record<string, QuestionInfo>>
  /** The passages questions cite that the rulebook has, by provision key. */
  citations: Readonly<Record<string, CitedProvision>>
  units: readonly VocabularyUnit[]
  loadProvisions: () => Promise<CitedProvision[]>
  onUpdate: DefinitionUpdate
}

const asSentenceOrNull = (text: string | null | undefined) => (text ? asSentence(text) : null)

/** The rulebook's values for a bound choice question, as the rules give them: every one, offered or not. */
function listedValues(available: ProjectTypeDefinition, subject: string, binding: string | null) {
  const field = allQuestions(available).find(
    (item) => item.subject === subject && item.field.binding !== null && item.field.binding === binding
  )?.field
  return field?.kind === "choice" ? field.options : []
}

/** Focuses a row's menu button, or another control, once the change that moves it has rendered. */
function focusSoon(find: () => HTMLElement | null | undefined) {
  setTimeout(() => find()?.focus(), 0)
}

const menuOf = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find(
    (button) => button.getAttribute("aria-label") === `Actions for ${name}`
  )

type QuestionRowProps = {
  group: ProjectGroup
  field: ProjectField
  handle: ReactNode
  citations: CitedProvision[]
  missing: number
  onEdit: () => void
  onSetRequired: (isRequired: boolean) => void
  onRemove: () => void
}

function QuestionRow({ group, field, handle, citations, missing, onEdit, onSetRequired, onRemove }: QuestionRowProps) {
  const [preview, setPreview] = useState<AnswerValue>(null)
  const id = `preview-${group.subject}-${field.property}`.replaceAll(/[^\w-]/g, "-")
  return (
    <div className="flex items-start gap-1 rounded-lg border bg-card py-3 pr-2 pl-1 sm:gap-2 sm:py-4 sm:pr-3">
      {handle}
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <QuestionField field={field} id={id} value={preview} onChange={setPreview} errors={[]} />
        <RuleCitations citations={citations} missing={missing} />
      </div>
      <RowActions
        name={field.label}
        actions={[
          { label: "Edit", icon: PencilIcon, onSelect: onEdit },
          field.isRequired
            ? { label: "Make optional", icon: CircleDashedIcon, onSelect: () => onSetRequired(false) }
            : { label: "Make required", icon: AsteriskIcon, onSelect: () => onSetRequired(true) },
          { label: "Remove", icon: Trash2Icon, onSelect: onRemove, isDestructive: true }
        ]}
      />
    </div>
  )
}

export function QuestionsCard({
  definition,
  available,
  info,
  citations,
  units,
  loadProvisions,
  onUpdate
}: QuestionsCardProps) {
  const [isPicking, setIsPicking] = useState(false)
  const [dialog, setDialog] = useState<{ subject: string; property: string } | "new" | null>(null)
  const candidates = candidateQuestions(definition, available)
  const options: PickerOption[] = candidates.map((candidate) => ({
    id: `${candidate.subject} ${candidate.field.property}`,
    title: candidate.field.label,
    description: asSentenceOrNull(
      (candidate.field.binding ? info[candidate.field.binding]?.meaning : null) ?? candidate.field.help
    ),
    detail:
      (candidate.field.citations ?? [])
        .slice(0, 3)
        .flatMap((key) => citations[key]?.label ?? [])
        .join(", ") || null,
    group: candidate.field.answeredBy === "association" ? "Usually known by the association" : candidate.section
  }))
  const editing =
    dialog !== null && dialog !== "new"
      ? definition.groups
          .find((group) => group.subject === dialog.subject)
          ?.fields.find((field) => field.property === dialog.property)
      : undefined

  const remove = (group: ProjectGroup, field: ProjectField, index: number) => {
    onUpdate((current) => removeQuestion(current, group.subject, field.property))
    const next = group.fields[index + 1] ?? group.fields[index - 1]
    focusSoon(() => (next ? menuOf(next.label) : document.getElementById("add-question")))
    toast(`Removed “${field.label}”`, {
      action: {
        label: "Undo",
        onClick: () => onUpdate((current) => addQuestion(current, available, group.subject, field, index))
      }
    })
  }
  const pick = (id: string) => {
    const candidate = candidates.find((item) => `${item.subject} ${item.field.property}` === id)
    if (!candidate) {
      return
    }
    onUpdate((current) => addQuestion(current, available, candidate.subject, candidate.field))
    toast(`Added “${candidate.field.label}”`)
  }
  const openAdd = () => setIsPicking(true)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Questions</h3>
        </CardTitle>
        <CardDescription>
          What homeowners answer, in this order. Drag a question by its handle to move it.
        </CardDescription>
        <CardAction>
          <Button id="add-question" variant="outline" onClick={openAdd}>
            <PlusIcon />
            Add question
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        {definition.groups.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListPlusIcon />
              </EmptyMedia>
              <EmptyTitle>No questions yet</EmptyTitle>
              <EmptyDescription>Add what the rules check, or write your own.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={openAdd}>
                <PlusIcon />
                Add question
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}
        {definition.groups.map((group) => (
          <section key={group.subject} className="flex flex-col gap-3" aria-labelledby={`section-${group.subject}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h4 id={`section-${group.subject}`} className="text-sm font-medium">
                {sentenceCase(group.label)}
              </h4>
              {group.isRepeatable ? (
                <span className="text-sm text-muted-foreground">Asked for each {group.itemLabel.toLowerCase()}</span>
              ) : null}
            </div>
            <SortableList
              items={group.fields}
              getId={(field) => `${group.subject} ${field.property}`}
              getName={(field) => field.label}
              label={`Questions about ${group.label.toLowerCase()}`}
              onMove={(from, to) => onUpdate((current) => moveQuestion(current, group.subject, from, to))}
              renderItem={(field, { index, handle }) => {
                const keys = field.citations ?? []
                return (
                  <QuestionRow
                    group={group}
                    field={field}
                    handle={handle}
                    citations={keys.flatMap((key) => citations[key] ?? [])}
                    missing={keys.filter((key) => !citations[key]).length}
                    onEdit={() => setDialog({ subject: group.subject, property: field.property })}
                    onSetRequired={(isRequired) =>
                      onUpdate((current) => updateQuestion(current, group.subject, { ...field, isRequired }))
                    }
                    onRemove={() => remove(group, field, index)}
                  />
                )
              }}
            />
          </section>
        ))}
      </CardContent>
      <PickerDialog
        title="Add a question"
        description="Suggestions are what the rules check, so the review can use the answers."
        options={options}
        emptyText="The form already asks everything the rules check."
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        onPick={pick}
        action={{
          label: "Write your own question",
          description: "Ask anything, with the answer type you choose.",
          onSelect: () => setDialog("new")
        }}
      />
      {dialog !== null && (dialog === "new" || editing) ? (
        <QuestionDialog
          key={dialog === "new" ? "new" : `${dialog.subject} ${dialog.property}`}
          editing={dialog !== "new" && editing ? { subject: dialog.subject, field: editing } : null}
          listed={dialog !== "new" && editing ? listedValues(available, dialog.subject, editing.binding) : []}
          sections={sectionsOf(definition, available)}
          citations={citations}
          units={units}
          loadProvisions={loadProvisions}
          newKey={(label) => customKey(definition, label)}
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              const name = dialog !== "new" ? editing?.label : undefined
              setDialog(null)
              focusSoon(() => (name ? menuOf(name) : document.getElementById("add-question")))
            }
          }}
          onAddDocument={(document) => {
            onUpdate((current) => addDocument(current, document))
            toast(`Added “${document.label}” to the documents`, {
              description: "Homeowners upload it with their files."
            })
          }}
          onSave={(subject, field) =>
            onUpdate((current) =>
              dialog === "new" || !current.groups.some((group) => group.subject === subject)
                ? addQuestion(current, available, subject, field)
                : updateQuestion(current, subject, field)
            )
          }
        />
      ) : null}
    </Card>
  )
}
