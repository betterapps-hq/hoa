import { useForm } from "@tanstack/react-form"
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  PencilIcon,
  Trash2Icon,
  XIcon
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
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
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
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

async function attempt(action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "That didn't work.")
  }
}

function RuleEditor({
  rule,
  onSave,
  onCancel
}: {
  rule: Rule
  onSave: (changes: RuleChanges) => Promise<void>
  onCancel: () => void
}) {
  const form = useForm({
    defaultValues: {
      title: rule.title,
      statement: rule.statement,
      obligation: rule.obligation,
      discretion: rule.discretion,
      isCurable: rule.isCurable,
      quotes: rule.citations.map((citation) => citation.quote)
    },
    validators: { onSubmit: ruleEditSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
    }
  })
  return (
    <form
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
                <FieldLabel htmlFor={`${rule.id}-obligation`}>Obligation</FieldLabel>
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
                <FieldLabel htmlFor={`${rule.id}-discretion`}>Who decides</FieldLabel>
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
              <FieldLabel htmlFor={`${rule.id}-curable`}>
                The homeowner can fix a failure by changing a detail
              </FieldLabel>
            </Field>
          )}
        </form.Field>
        <form.Field name="quotes" mode="array">
          {(field) =>
            field.state.value.map((_, index) => (
              <form.Field key={rule.citations[index]?.pageIndex ?? index} name={`quotes[${index}]`}>
                {(quote) => (
                  <Field>
                    <FieldLabel htmlFor={`${rule.id}-quote-${index}`}>
                      Quote from {rule.citations[index]?.section}, page{" "}
                      {rule.citations[index]?.pageLabel ?? rule.citations[index]?.pageIndex}
                    </FieldLabel>
                    <Textarea
                      id={`${rule.id}-quote-${index}`}
                      value={quote.state.value}
                      onChange={(event) => quote.handleChange(event.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
            ))
          }
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Field orientation="horizontal">
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </Field>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

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

export type RuleCardProps = { rule: Rule; actions?: RuleCardActions }

/** One rule with its check, conditions, citations and issues. Without actions it's read-only. */
export function RuleCard({ rule, actions }: RuleCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [resolving, setResolving] = useState<{ index: number; note: string } | null>(null)
  const conditions = describeConditions(rule.appliesWhen)
  const blocker = approvalBlocker(rule)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{rule.title}</CardTitle>
        <CardDescription>{rule.statement}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-1">
          {rule.change === "new" || rule.change === "changed" ? (
            <Badge variant="secondary">{rule.change === "new" ? "New" : "Changed"}</Badge>
          ) : null}
          <Badge variant="outline">{obligationLabels[rule.obligation]}</Badge>
          {rule.discretion === "committee" ? <Badge variant="outline">Committee decides</Badge> : null}
          {actions ? (
            <Badge variant={rule.review.status === "rejected" ? "destructive" : "outline"}>
              {rule.review.status === "approved" ? (
                <CircleCheckIcon className="text-green-600 dark:text-green-400" />
              ) : null}
              {rule.review.status === "rejected" ? <CircleXIcon /> : null}
              {reviewLabels[rule.review.status]}
            </Badge>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {isEditing && actions ? (
          <RuleEditor
            rule={rule}
            onCancel={() => setIsEditing(false)}
            onSave={(changes) =>
              attempt(async () => {
                await actions.save(rule.id, changes)
                setIsEditing(false)
              })
            }
          />
        ) : (
          <>
            <dl className="grid gap-1 sm:grid-cols-[8rem_1fr]">
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
            <ul className="flex flex-col gap-2">
              {rule.citations.map((citation) => (
                <li
                  key={`${citation.documentId}:${citation.pageIndex}:${citation.quote}`}
                  className="rounded-lg border p-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                    <span>
                      {citation.section}, page {citation.pageLabel ?? citation.pageIndex}
                    </span>
                    <Badge variant={citation.match.status === "not-found" ? "destructive" : "outline"}>
                      {matchLabels[citation.match.status]}
                    </Badge>
                  </div>
                  <blockquote className="mt-1 border-l-2 pl-2 italic">{citation.quote}</blockquote>
                </li>
              ))}
            </ul>
          </>
        )}
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
      </CardContent>
      {actions && !isEditing ? (
        <CardFooter className="flex flex-wrap gap-2">
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
        </CardFooter>
      ) : null}
    </Card>
  )
}
