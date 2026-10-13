import { useForm } from "@tanstack/react-form"
import { ArrowLeftRightIcon, CopyPlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { RowActions } from "@/components/RowActions/RowActions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import { copiedAlong, isCopyable, pickableTerms, swapCandidates, type TermChange } from "@/rulebook/ruleTerms"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { describeTermKind } from "../TermChip/TermChip.utils"
import { useTermEditing } from "../TermEditor/TermEditor"
import { TermPicker } from "../TermPicker/TermPicker"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

// A term's actions in a rule's card (encoding.md, UX, Rule card). A term means the same in every rule that uses it, so
// where this rule means something else by its words, it uses a different term: one the rulebook has that fits where
// the rule uses this one, or a new term made from a copy. Only this rule changes.

export type RuleTermMenuProps = {
  rule: T.Rule
  term: T.Term
  /** How many rules use the term, this one among them. */
  usedBy: number
}

const listFormat = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" })

/** What the change leaves alone, in a sentence: the term's meaning in the other rules, and the rule's review. */
function leftAlone(rule: T.Rule, label: string, usedBy: number) {
  const others = usedBy - 1
  const elsewhere =
    others === 0
      ? `“${label}” stays in the rulebook.`
      : `“${label}” keeps its meaning in ${others === 1 ? "the other rule" : `the ${others} other rules`} that use it.`
  return rule.review.status === "proposed" ? elsewhere : `${elsewhere} The rule goes back to review.`
}

/** The term's menu in the rule's card: use a different term here, or a new one made from a copy. */
export function RuleTermMenu({ rule, term, usedBy }: RuleTermMenuProps) {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const [dialog, setDialog] = useState<"swap" | "copy" | null>(null)
  const editing = useTermEditing(term)
  if (!actions) {
    return null
  }
  const label = sentenceCase(vocabulary.label(term.key))
  const candidates = swapCandidates(vocabulary, pickableTerms(records.terms), rule, term.key)
  // A copy for a term only this rule uses changes nothing another rule reads, so it isn't offered.
  const canCopy = isCopyable(term) && usedBy > 1
  const items = [
    ...(candidates.length > 0
      ? [{ label: "Use a different term here", icon: ArrowLeftRightIcon, onSelect: () => setDialog("swap") }]
      : []),
    ...(canCopy ? [{ label: "Use a new term here", icon: CopyPlusIcon, onSelect: () => setDialog("copy") }] : []),
    // Editing the term changes it in every rule that uses it, unlike the two above.
    ...(editing.edit ? [{ ...editing.edit, label: "Edit the term" }] : [])
  ]
  if (items.length === 0) {
    return null
  }
  const change = async (to: TermChange, done: string) => {
    const issues = await attempt(() => actions.changeRuleTerm(rule.key, term.key, to), "The rule wasn't changed.")
    if (issues) {
      setDialog(null)
      toast.success(done)
    }
  }
  const options = candidates
    .map((candidate) => ({
      key: candidate.key,
      label: sentenceCase(vocabulary.label(candidate.key)),
      hint: describeTermKind(candidate, vocabulary)
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
  const along = copiedAlong(vocabulary, rule, term.key).map((item) => sentenceCase(vocabulary.label(item.key)))
  return (
    <>
      <RowActions name={label} actions={items} />
      {editing.dialogs}
      <Dialog open={dialog === "swap"} onOpenChange={(isOpen) => setDialog(isOpen ? "swap" : null)}>
        <DialogContent className="sm:max-w-lg">
          <SwapForm
            label={label}
            options={options}
            note={leftAlone(rule, label, usedBy)}
            onSwap={(key) =>
              change(
                { type: "term", key },
                `This rule now uses “${sentenceCase(vocabulary.label(key))}” instead of “${label}”.`
              )
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "copy"} onOpenChange={(isOpen) => setDialog(isOpen ? "copy" : null)}>
        <DialogContent className="sm:max-w-lg">
          <CopyForm
            label={label}
            definition={term.definition}
            along={along}
            note={leftAlone(rule, label, usedBy)}
            onCopy={(copy) =>
              change({ type: "copy", ...copy }, `This rule now uses “${copy.label}”, a new term to review.`)
            }
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

type SwapFormProps = {
  label: string
  options: { key: T.TermKey; label: string; hint: string }[]
  note: string
  onSwap: (key: T.TermKey) => Promise<void>
}

function SwapForm({ label, options, note, onSwap }: SwapFormProps) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (event) => {
        event.preventDefault()
        if (chosen) {
          setIsSaving(true)
          await onSwap(chosen)
          setIsSaving(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Use a different term in this rule</DialogTitle>
        <DialogDescription>
          In place of “{label}”, in this rule only. {note}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="rule-term-swap">Term</FieldLabel>
        <TermPicker id="rule-term-swap" value={chosen} options={options} onChange={setChosen} hints="words" />
        <FieldDescription>The terms that fit where the rule uses “{label}”.</FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={chosen === null || isSaving}>
          {isSaving ? <Spinner /> : null}
          Use it
        </Button>
      </DialogFooter>
    </form>
  )
}

type CopyFormProps = {
  label: string
  definition: string | null
  /** What the copy takes along, by name: the details and kinds of it the rule reads. */
  along: string[]
  note: string
  onCopy: (copy: { label: string; definition: string | null }) => Promise<void>
}

function CopyForm({ label, definition, along, note, onCopy }: CopyFormProps) {
  const form = useForm({
    defaultValues: { label: "", definition: definition ?? "" },
    validators: {
      onSubmit: z.object({
        label: z
          .string()
          .trim()
          .min(1, "Give the new term a name.")
          .refine(
            (value) => value.toLocaleLowerCase() !== label.toLocaleLowerCase(),
            `Give it a name that tells it apart from “${label}”.`
          ),
        definition: z.string()
      })
    },
    onSubmit: ({ value }) => onCopy({ label: value.label.trim(), definition: value.definition.trim() || null })
  })
  const takes = along.length > 0 ? `, with what this rule reads of it: ${listFormat.format(along)}` : ""
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
        <DialogTitle>A new term for this rule</DialogTitle>
        <DialogDescription>
          It starts as a copy of “{label}”{takes}. Only this rule uses it. {note}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.Field name="label">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="rule-term-copy-label">
                Name
                <span aria-hidden className="ml-0.5 text-destructive">
                  *
                </span>
              </FieldLabel>
              <Input
                id="rule-term-copy-label"
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
        <form.Field name="definition">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="rule-term-copy-definition">What it means</FieldLabel>
              <Textarea
                id="rule-term-copy-definition"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldDescription>What it means in this rule, in a sentence.</FieldDescription>
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              Make the term
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
