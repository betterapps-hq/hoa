import { useForm } from "@tanstack/react-form"
import { MergeIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import type { RowAction } from "@/components/RowActions/RowActions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import { termKeysOf } from "@/rulebook/review"
import { pickableTerms } from "@/rulebook/ruleTerms"
import { approvedRulesUsing, changesMeaning, type TermEdit } from "@/rulebook/termEdits"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { countOf } from "../rulebookRecords"
import { describeTermKind } from "../TermChip/TermChip.utils"
import { TermPicker } from "../TermPicker/TermPicker"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

// Editing a term (encoding.md, UX, Terms): its names, what it means, a quantity's unit, whether a list allows only its
// choices, and merging it into another term. A term means the same in every rule that uses it, so the editor says
// before saving when a change sends the approved rules that read it back to review.

const preferredLabel = (term: T.Term) => term.labels.find((label) => label.role === "preferred")?.text ?? term.key

/**
 * A term's edit and merge actions, for its menu, with the dialogs they open, to render outside anything that closes
 * when a dialog opens (a menu, a popover).
 */
export function useTermEditing(term: T.Term | null | undefined): {
  edit: RowAction | null
  merge: RowAction | null
  dialogs: ReactNode
} {
  const { mergeTargets, actions } = useRulebookWorkspace()
  const [dialog, setDialog] = useState<"edit" | "merge" | null>(null)
  if (!term || !actions) {
    return { edit: null, merge: null, dialogs: null }
  }
  const candidates = mergeTargets(term.key)
  const close = (isOpen: boolean) => {
    if (!isOpen) {
      setDialog(null)
    }
  }
  return {
    edit: { label: "Edit", icon: PencilIcon, onSelect: () => setDialog("edit") },
    merge:
      candidates.length > 0
        ? { label: "Merge into another term", icon: MergeIcon, onSelect: () => setDialog("merge") }
        : null,
    dialogs: (
      <>
        <Dialog open={dialog === "edit"} onOpenChange={close}>
          <DialogContent className="sm:max-w-lg">
            <EditForm term={term} onSaved={() => setDialog(null)} />
          </DialogContent>
        </Dialog>
        <Dialog open={dialog === "merge"} onOpenChange={close}>
          <DialogContent className="sm:max-w-lg">
            <MergeForm term={term} candidates={candidates} onMerged={() => setDialog(null)} />
          </DialogContent>
        </Dialog>
      </>
    )
  }
}

/** What a change to the meaning does to the rules, in a sentence; nothing when no approved rule reads the term. */
function backToReviewNote(approvedRules: number) {
  return approvedRules === 0
    ? null
    : `Saving sends the ${countOf(approvedRules, "approved rule", "approved rules")} that use it back to review, since what they mean changes.`
}

function EditForm({ term, onSaved }: { term: T.Term; onSaved: () => void }) {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const quantityUnit = term.kind === "property" && term.valueType.type === "quantity" ? term.valueType.unit : null
  const dimension = quantityUnit ? vocabulary.get(quantityUnit) : undefined
  const units = pickableTerms(records.terms)
    .filter((item) => item.kind === "unit" && dimension?.kind === "unit" && item.dimension === dimension.dimension)
    .map((item) => ({ value: item.key, label: sentenceCase(vocabulary.label(item.key, true)) }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
  const approvedRules = approvedRulesUsing(records.rules, term.key).length
  const form = useForm({
    defaultValues: {
      label: preferredLabel(term),
      alternatives: term.labels
        .filter((label) => label.role === "alternative")
        .map((label) => label.text)
        .join("\n"),
      definition: term.definition ?? "",
      unit: quantityUnit ?? "",
      isComplete: term.kind === "value-set" ? term.complete : false
    },
    validators: {
      onSubmit: z.object({
        label: z.string().trim().min(1, "Give it a name."),
        alternatives: z.string(),
        definition: z.string(),
        unit: z.string(),
        isComplete: z.boolean()
      })
    },
    onSubmit: async ({ value }) => {
      const saved = await attempt(async () => {
        await actions?.saveTerm(editOf(term, value))
        return true
      }, "The term wasn't saved.")
      if (saved) {
        toast.success(`Saved “${value.label.trim()}”.`)
        onSaved()
      }
    }
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit {sentenceCase(vocabulary.label(term.key))}</DialogTitle>
        <DialogDescription>
          {describeTermKind(term, vocabulary)}. It means the same in every rule that uses it.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.Field name="label">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="term-edit-label">
                Name
                <RequiredMark />
              </FieldLabel>
              <Input
                id="term-edit-label"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="alternatives">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="term-edit-alternatives">Also called</FieldLabel>
              <Textarea
                id="term-edit-alternatives"
                rows={2}
                className="min-h-0"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldDescription>Other names the documents use for it, one to a line.</FieldDescription>
            </Field>
          )}
        </form.Field>
        <form.Field name="definition">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="term-edit-definition">What it means</FieldLabel>
              <Textarea
                id="term-edit-definition"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>
        {quantityUnit && units.length > 1 ? (
          <form.Field name="unit">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="term-edit-unit">Kept in</FieldLabel>
                <ChoiceSelect
                  id="term-edit-unit"
                  value={field.state.value}
                  choices={units}
                  onChange={field.handleChange}
                />
                <FieldDescription>Amounts in other units convert to it.</FieldDescription>
              </Field>
            )}
          </form.Field>
        ) : null}
        {term.kind === "value-set" ? (
          <form.Field name="isComplete">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="term-edit-complete"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="term-edit-complete">Only these choices</FieldLabel>
                  <FieldDescription>Any other answer is refused.</FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>
        ) : null}
      </FieldGroup>
      <form.Subscribe selector={(state) => changesMeaning(term, editOf(term, state.values))}>
        {(isNewMeaning) => {
          const note = isNewMeaning ? backToReviewNote(approvedRules) : null
          return note ? <p className="text-sm text-muted-foreground">{note}</p> : null
        }}
      </form.Subscribe>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              Save
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

type EditValues = { label: string; alternatives: string; definition: string; unit: string; isComplete: boolean }

/** The form's values as an edit of the term: only what applies to its kind. */
function editOf(term: T.Term, values: EditValues): TermEdit {
  return {
    key: term.key,
    label: values.label.trim(),
    // One name to a line: a name may have a comma in it.
    alternatives: values.alternatives
      .split("\n")
      .map((text) => text.trim())
      .filter((text) => text !== ""),
    definition: values.definition.trim() || null,
    ...(term.kind === "property" && term.valueType.type === "quantity" && values.unit ? { unit: values.unit } : {}),
    ...(term.kind === "value-set" ? { isComplete: values.isComplete } : {})
  }
}

type MergeFormProps = { term: T.Term; candidates: { key: T.TermKey; kind: string }[]; onMerged: () => void }

function MergeForm({ term, candidates, onMerged }: MergeFormProps) {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const [into, setInto] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const name = sentenceCase(vocabulary.label(term.key))
  const using = records.rules.filter(
    (rule) => rule.review.status !== "rejected" && termKeysOf(rule).has(term.key)
  ).length
  const options = candidates
    .flatMap((candidate) => {
      const content = vocabulary.get(candidate.key)
      return content
        ? [
            {
              key: candidate.key,
              label: sentenceCase(vocabulary.label(candidate.key)),
              hint: describeTermKind(content, vocabulary)
            }
          ]
        : []
    })
    .toSorted((a, b) => a.label.localeCompare(b.label))
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!into || !actions) {
          return
        }
        setIsMerging(true)
        const merged = await attempt(async () => {
          await actions.mergeTerm(term.key, into)
          return true
        }, "The terms weren't merged.")
        setIsMerging(false)
        if (merged) {
          toast.success(`Merged “${name}” into “${sentenceCase(vocabulary.label(into))}”.`)
          onMerged()
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Merge {name} into another term</DialogTitle>
        <DialogDescription>
          Every rule and term that uses “{name}” uses the one you choose instead, and “{name}” is rejected.
          {using > 0 ? ` The ${countOf(using, "rule", "rules")} that use it go back to review.` : null}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="term-merge-into">Merge into</FieldLabel>
        <TermPicker id="term-merge-into" value={into} options={options} onChange={setInto} hints="words" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={into === null || isMerging}>
          {isMerging ? <Spinner /> : null}
          Merge
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Adds a choice to a list, from the list in the terms tab. */
export function AddChoice({ list }: { list: T.Term }) {
  const { vocabulary, actions } = useRulebookWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const form = useForm({
    defaultValues: { label: "" },
    validators: { onSubmit: z.object({ label: z.string().trim().min(1, "Give the choice a name.") }) },
    onSubmit: async ({ value }) => {
      const added = await attempt(async () => {
        await actions?.addChoice(list.key, value.label.trim())
        return true
      }, "The choice wasn't added.")
      if (added) {
        toast.success(`Added “${value.label.trim()}”.`)
        setIsOpen(false)
        form.reset()
      }
    }
  })
  if (!actions) {
    return null
  }
  const name = vocabulary.label(list.key, true)
  return (
    <>
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setIsOpen(true)}>
        <PlusIcon aria-hidden />
        Add a choice
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a choice</DialogTitle>
              <DialogDescription>A new choice among the {name}, to review like any new term.</DialogDescription>
            </DialogHeader>
            <form.Field name="label">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="add-choice-label">
                    Name
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="add-choice-label"
                    required
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <DialogFooter>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner /> : null}
                    Add it
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
