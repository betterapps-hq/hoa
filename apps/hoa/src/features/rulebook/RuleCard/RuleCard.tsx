import { useForm } from "@tanstack/react-form"
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileSearchIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { InfoTip } from "@/components/info-tip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  DocumentViewer,
  type CitationSource,
  type PageSelectionInput
} from "@/features/documents/DocumentViewer/DocumentViewer"
import type { Rule } from "@/rules/rule"
import {
  approvalBlocker,
  describeCheck,
  describeConditions,
  issueSeverity,
  ruleEditSchema,
  type IssueSeverity,
  type RuleChanges
} from "../rulebookEditing"

export type RuleCardActions = {
  review: (ruleId: string, status: Rule["review"]["status"]) => Promise<void>
  save: (ruleId: string, changes: RuleChanges) => Promise<void>
  resolveIssue: (ruleId: string, issueIndex: number, note: string) => Promise<void>
  remove: (ruleId: string) => Promise<void>
  addCitation: (ruleId: string, selection: PageSelectionInput) => Promise<void>
  removeCitation: (ruleId: string, index: number) => Promise<void>
}

const obligationLabels: Record<Rule["obligation"], string> = {
  required: "Required",
  prohibited: "Prohibited",
  permitted: "Permitted",
  recommended: "Recommended"
}

const reviewLabels: Record<Rule["review"]["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
}

const matchLabels: Record<Rule["citations"][number]["match"]["status"], string> = {
  exact: "Quote found",
  fuzzy: "Quote found, with scan differences",
  "not-found": "Quote not found"
}

/** Runs an action, showing its error; resolves to whether it succeeded. */
async function attempt(action: () => Promise<void>) {
  try {
    await action()
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "That didn't work.")
    return false
  }
}

const editFormId = (rule: Pick<Rule, "id">) => `rule-edit-${rule.id}`

/** The rule's editable fields. Save and Cancel are in the panel's pinned footer, linked by the form's id. */
function RuleEditor({ rule, onSave }: { rule: Rule; onSave: (changes: RuleChanges) => Promise<void> }) {
  const form = useForm({
    defaultValues: {
      title: rule.title,
      statement: rule.statement,
      obligation: rule.obligation,
      discretion: rule.discretion,
      isCurable: rule.isCurable
    },
    validators: { onSubmit: ruleEditSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
    }
  })
  return (
    <form
      id={editFormId(rule)}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="title">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${rule.id}-title`}>Title</FieldLabel>
              <Input
                id={`${rule.id}-title`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="statement">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${rule.id}-statement`}>Rule</FieldLabel>
              <Textarea
                id={`${rule.id}-statement`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="obligation">
            {(field) => (
              <Field>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor={`${rule.id}-obligation`}>Obligation</FieldLabel>
                  <InfoTip label="About obligation">
                    How strongly the documents state the rule. Required (“shall”, “must”) and prohibited (“shall not”)
                    rules can fail an application. Recommended (“should”) rules never fail it; they go to the committee.
                    Permitted (“may”) rules describe what’s allowed.
                  </InfoTip>
                </div>
                <NativeSelect
                  id={`${rule.id}-obligation`}
                  value={field.state.value}
                  onChange={(event) => {
                    const value = (["required", "prohibited", "permitted", "recommended"] as const).find(
                      (item) => item === event.target.value
                    )
                    if (value) {
                      field.handleChange(value)
                    }
                  }}
                >
                  {Object.entries(obligationLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
          <form.Field name="discretion">
            {(field) => (
              <Field>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor={`${rule.id}-discretion`}>Who decides</FieldLabel>
                  <InfoTip label="About who decides">
                    Checked by the rules: the review decides from the application whether the rule is met. The
                    committee: the documents leave it to the reviewer’s judgment (“case by case”, “at the discretion
                    of”), so the review only flags it for the committee and it never changes the recommendation.
                  </InfoTip>
                </div>
                <NativeSelect
                  id={`${rule.id}-discretion`}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value === "committee" ? "committee" : "objective")
                  }
                >
                  <NativeSelectOption value="objective">Checked by the rules</NativeSelectOption>
                  <NativeSelectOption value="committee">The committee</NativeSelectOption>
                </NativeSelect>
              </Field>
            )}
          </form.Field>
        </div>
        <form.Field name="isCurable">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`${rule.id}-curable`}
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
              />
              <div className="flex items-center gap-1.5">
                <FieldLabel htmlFor={`${rule.id}-curable`}>Fixable by changing a detail</FieldLabel>
                <InfoTip label="About fixable rules">
                  Check this when a homeowner who fails the rule could meet it by changing a detail of the plan, such as
                  a color, height or material. If every rule an application fails is fixable, the review recommends
                  approval with conditions instead of rejection. Leave it unchecked when failing rules the project out,
                  such as a prohibited location.
                </InfoTip>
              </div>
            </Field>
          )}
        </form.Field>
      </FieldGroup>
    </form>
  )
}

type ViewerState = { documentId: string; pageIndex: number; isCiting: boolean }

/**
 * A rule's citations. Each is fixed text from a document: it can be opened in the document, removed, or replaced by
 * adding the right passage, but never edited.
 */
function Citations({ rule, actions, source }: Pick<RuleCardProps, "rule" | "actions" | "source">) {
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  // The dialog keeps showing what it opened with while it animates closed.
  const [isOpen, setIsOpen] = useState(false)
  const open = (state: ViewerState) => {
    setViewer(state)
    setIsOpen(true)
  }
  const first = rule.citations[0]
  const canRemove = actions !== undefined && rule.citations.length > 1
  return (
    <section aria-label="Citations" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Citations</h3>
        {actions && source && first ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => open({ documentId: first.documentId, pageIndex: first.pageIndex, isCiting: true })}
          >
            <PlusIcon />
            Add citation
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {rule.citations.map((citation, index) => (
          <li key={`${citation.documentId}:${citation.pageIndex}:${citation.quote}`} className="rounded-lg border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
              <span>
                {citation.section}, page {citation.pageLabel ?? citation.pageIndex}
              </span>
              <Badge variant={citation.match.status === "not-found" ? "destructive" : "outline"}>
                {matchLabels[citation.match.status]}
              </Badge>
            </div>
            <blockquote className="mt-1 border-l-2 pl-2 italic">{citation.quote}</blockquote>
            {source || canRemove ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {source ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      open({ documentId: citation.documentId, pageIndex: citation.pageIndex, isCiting: false })
                    }
                  >
                    <FileSearchIcon />
                    View in document
                  </Button>
                ) : null}
                {canRemove ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void attempt(() => actions.removeCitation(rule.id, index))}
                  >
                    <Trash2Icon />
                    Remove
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {source ? (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{viewer?.isCiting ? "Add a citation" : "Citation in the document"}</DialogTitle>
              <DialogDescription>{rule.title}</DialogDescription>
            </DialogHeader>
            {viewer ? (
              <DocumentViewer
                source={source}
                initial={viewer}
                highlights={rule.citations}
                onCite={
                  viewer.isCiting && actions
                    ? async (selection) => {
                        if (await attempt(() => actions.addCitation(rule.id, selection))) {
                          setIsOpen(false)
                        }
                      }
                    : undefined
                }
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

/** The actions stay at the bottom of the panel while the rule scrolls above them. */
const pinnedFooter = "flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-4 py-3"

const issueIconClass = "mt-0.5 size-4 shrink-0"

function IssueIcon({ severity }: { severity: IssueSeverity | "resolved" }) {
  switch (severity) {
    case "resolved":
      return <CheckIcon className={`${issueIconClass} text-muted-foreground`} aria-label="Resolved" />
    case "note":
      return <InfoIcon className={`${issueIconClass} text-muted-foreground`} aria-label="Note" />
    case "blocking":
      return <AlertTriangleIcon className={`${issueIconClass} text-destructive`} aria-label="Must be resolved" />
    case "warning":
      return (
        <AlertTriangleIcon className={`${issueIconClass} text-amber-600 dark:text-amber-400`} aria-label="Warning" />
      )
  }
}

export type RuleCardProps = {
  rule: Rule
  actions?: RuleCardActions
  /** The documents citations come from; without it citations can't be opened or added. */
  source?: CitationSource
}

/**
 * One rule as a side panel's body: its details, citations and issues scroll, and its actions are pinned to the bottom.
 * Without actions it's read-only.
 */
export function RuleCard({ rule, actions, source }: RuleCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [resolving, setResolving] = useState<{ index: number; note: string } | null>(null)
  const conditions = describeConditions(rule.appliesWhen)
  const blocker = approvalBlocker(rule)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm">
        {isEditing ? null : (
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-medium">{rule.title}</h3>
              <p className="text-muted-foreground">{rule.statement}</p>
            </div>
            {actions ? (
              <div className="shrink-0">
                <Badge variant={rule.review.status === "rejected" ? "destructive" : "outline"}>
                  {rule.review.status === "approved" ? (
                    <CircleCheckIcon className="text-green-600 dark:text-green-400" />
                  ) : null}
                  {rule.review.status === "rejected" ? <CircleXIcon /> : null}
                  {reviewLabels[rule.review.status]}
                </Badge>
              </div>
            ) : null}
          </header>
        )}
        <div className="flex flex-col gap-3">
          {isEditing && actions ? (
            <RuleEditor
              rule={rule}
              onSave={async (changes) => {
                setIsSaving(true)
                await attempt(async () => {
                  await actions.save(rule.id, changes)
                  setIsEditing(false)
                })
                setIsSaving(false)
              }}
            />
          ) : (
            <>
              <dl className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Obligation</dt>
                <dd>{obligationLabels[rule.obligation]}</dd>
                <dt className="text-muted-foreground">Who decides</dt>
                <dd>{rule.discretion === "committee" ? "The committee" : "Checked by the rules"}</dd>
                <dt className="text-muted-foreground">Check</dt>
                <dd>{describeCheck(rule.check)}</dd>
                {conditions ? (
                  <>
                    <dt className="text-muted-foreground">Applies when</dt>
                    <dd>{conditions}</dd>
                  </>
                ) : null}
                {rule.exceptions.length > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Exceptions</dt>
                    <dd>{rule.exceptions.join("; ")}</dd>
                  </>
                ) : null}
              </dl>
            </>
          )}
          <Citations rule={rule} actions={actions} source={source} />
          {actions && rule.issues.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {rule.issues.map((issue, index) => {
                const severity = issueSeverity(issue)
                return (
                  <li
                    key={`${issue.code}:${issue.message}`}
                    className={
                      issue.resolution ? "flex flex-col gap-2 p-1" : "flex flex-col gap-2 rounded-lg bg-muted p-2"
                    }
                  >
                    <div className="flex items-start gap-2">
                      <IssueIcon severity={issue.resolution ? "resolved" : severity} />
                      <span
                        className={issue.resolution || severity === "note" ? "flex-1 text-muted-foreground" : "flex-1"}
                      >
                        {issue.message}
                        {issue.resolution ? <> Resolved: {issue.resolution.note}</> : null}
                      </span>
                      {!issue.resolution && resolving?.index !== index ? (
                        <Button size="sm" variant="outline" onClick={() => setResolving({ index, note: "" })}>
                          Resolve
                        </Button>
                      ) : null}
                    </div>
                    {resolving?.index === index ? (
                      <div className="flex gap-2">
                        <Input
                          aria-label="Why this is resolved"
                          placeholder="Why this is resolved"
                          value={resolving.note}
                          onChange={(event) => setResolving({ index, note: event.target.value })}
                        />
                        <Button
                          size="sm"
                          disabled={!resolving.note.trim()}
                          onClick={() =>
                            attempt(async () => {
                              await actions.resolveIssue(rule.id, index, resolving.note.trim())
                              setResolving(null)
                            })
                          }
                        >
                          Save
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
      {actions && isEditing ? (
        <footer className={pinnedFooter}>
          <Button size="sm" type="submit" form={editFormId(rule)} disabled={isSaving}>
            {isSaving ? "Saving" : "Save"}
          </Button>
          <Button size="sm" variant="outline" disabled={isSaving} onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </footer>
      ) : null}
      {actions && !isEditing ? (
        <footer className={pinnedFooter}>
          <Button
            size="sm"
            disabled={blocker !== null || rule.review.status === "approved"}
            title={blocker ?? undefined}
            onClick={() => attempt(() => actions.review(rule.id, "approved"))}
          >
            <CheckIcon />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rule.review.status === "rejected"}
            onClick={() => attempt(() => actions.review(rule.id, "rejected"))}
          >
            <XIcon />
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
            <PencilIcon />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
              <Trash2Icon />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{rule.title}” is removed from the draft. Reviews keep using the published version until you publish.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void attempt(() => actions.remove(rule.id))}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {blocker ? <span className="text-xs text-muted-foreground">{blocker}</span> : null}
        </footer>
      ) : null}
    </div>
  )
}
