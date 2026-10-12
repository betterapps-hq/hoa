import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { sentenceCase } from "@/lib/text"
import type { RulebookChange } from "@/projectTypes/updates"

// Reviewing what a newer rulebook changes in a project type's form (application-review.md, Project types, Out of
// date): each change accepted or the administrator's version kept, "Accept all" for the lot, then one save. Until
// then homeowners keep the form as it is.

export type UpdatesDialogProps = {
  changes: readonly RulebookChange[]
  /** The callout's line: "Out of date with the rulebook published Oct 12". */
  title: string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Saves the form with the accepted changes, by id. */
  onSave: (accepted: ReadonlySet<string>) => Promise<void>
}

/** "3 questions and 1 document changed, and 2 cited passages are gone": a short summary for the callout. */
export function changesSummary(changes: readonly RulebookChange[]) {
  const count = (kinds: readonly RulebookChange["kind"][]) =>
    changes.filter((change) => kinds.includes(change.kind)).length
  const questions = count(["question-new", "question-gone", "question-changed"])
  const documents = count(["document-new", "document-gone", "document-changed"])
  const citations = count(["citation-gone"])
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const changed = [
    questions > 0 ? plural(questions, "question", "questions") : null,
    documents > 0 ? plural(documents, "document", "documents") : null
  ].filter((part) => part !== null)
  const parts = [
    changed.length > 0 ? `${changed.join(" and ")} changed` : null,
    citations > 0
      ? `${plural(citations, "question cites", "questions cite")} a passage the rulebook no longer has`
      : null
  ].filter((part) => part !== null)
  return parts.length > 0
    ? `${sentenceCase(parts.join(", and "))}.`
    : "Nothing in this form changed; updating it uses the published rules."
}

export function UpdatesDialog({ changes, title, isOpen, onOpenChange, onSave }: UpdatesDialogProps) {
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => new Set(changes.map((change) => change.id)))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sections = [
    { title: "Questions", items: changes.filter((change) => change.subject !== null) },
    { title: "Documents", items: changes.filter((change) => change.subject === null) }
  ].filter((section) => section.items.length > 0)
  const choose = (id: string, isAccepted: boolean) => {
    const next = new Set(accepted)
    if (isAccepted) {
      next.add(id)
    } else {
      next.delete(id)
    }
    setAccepted(next)
  }
  const save = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onSave(accepted)
      onOpenChange(false)
    } catch {
      setError("The updates weren't saved. Try again.")
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review updates</DialogTitle>
          <DialogDescription>{title}. Homeowners keep the form as it is until you save.</DialogDescription>
        </DialogHeader>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{changesSummary(changes)}</p>
        ) : (
          sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3" aria-label={section.title}>
              <h3 className="text-sm font-medium">{section.title}</h3>
              <ul className="flex flex-col gap-2">
                {section.items.map((change) => (
                  <li
                    key={change.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="font-medium">{sentenceCase(change.label)}</span>
                      <span className="text-muted-foreground">{change.detail}</span>
                    </div>
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      aria-label={`For ${change.label}`}
                      className="shrink-0"
                      value={[accepted.has(change.id) ? "accept" : "keep"]}
                      onValueChange={(value) => {
                        if (value[0]) {
                          choose(change.id, value[0] === "accept")
                        }
                      }}
                    >
                      <ToggleGroupItem value="accept">Accept</ToggleGroupItem>
                      <ToggleGroupItem value="keep">Keep mine</ToggleGroupItem>
                    </ToggleGroup>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          {changes.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccepted(new Set(changes.map((change) => change.id)))}
            >
              Accept all
            </Button>
          ) : null}
          <Button type="button" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
