import { CheckIcon, CircleAlertIcon, InfoIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { isBlocking } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import { attempt } from "../attempt"
import { RuleLink } from "../RuleLink/RuleLink"
import { issueCodeLabels } from "./IssueList.utils"

export type IssueListProps = {
  /** Issues stored on the record, from the build or review. */
  issues: T.Issue[]
  /** Problems validation finds on the record now. */
  found: RulebookIssue[]
  /** With this, an open issue can be resolved with a note. */
  onResolve?: (index: number, note: string) => Promise<void>
}

/** A record's issues: what the build left and what validation finds now; open ones that block approval stand out. */
export function IssueList({ issues, found, onResolve }: IssueListProps) {
  const [resolving, setResolving] = useState<number | null>(null)
  const [note, setNote] = useState("")
  if (issues.length === 0 && found.length === 0) {
    return <p className="text-sm text-muted-foreground">No issues.</p>
  }
  const resolve = async (index: number) => {
    if (!onResolve || !note.trim()) {
      return
    }
    const done = await attempt(async () => {
      await onResolve(index, note.trim())
      return true
    }, "The issue wasn't resolved.")
    if (done) {
      setResolving(null)
      setNote("")
    }
  }
  return (
    <ul className="flex flex-col gap-3">
      {found.map((issue) => (
        <li
          key={`found ${issue.code} ${issue.path.join(".")} ${issue.message}`}
          className="flex items-start gap-2 text-sm"
        >
          {isBlocking(issue.code) ? (
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          ) : (
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">
              {issueCodeLabels[issue.code]}
              {isBlocking(issue.code) ? <span className="sr-only">, blocks approval</span> : null}
            </span>
            <span>{issue.message}</span>
            {issue.path.length > 0 ? (
              <span className="font-mono text-xs text-muted-foreground">{issue.path.join(".")}</span>
            ) : null}
          </span>
        </li>
      ))}
      {issues.map((issue, index) => {
        const isOpen = issue.resolution === null
        return (
          // Stored issues keep their order; resolving one changes it in place.
          <li key={index} className="flex flex-col gap-2 text-sm">
            <div className="flex items-start gap-2">
              {isOpen ? (
                <CircleAlertIcon
                  className={`mt-0.5 size-4 shrink-0 ${isBlocking(issue.code) ? "text-destructive" : "text-muted-foreground"}`}
                  aria-hidden
                />
              ) : (
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{issueCodeLabels[issue.code]}</span>
                  {isOpen && isBlocking(issue.code) ? <Badge variant="destructive">Blocks approval</Badge> : null}
                  {isOpen ? null : <Badge variant="outline">Resolved</Badge>}
                </div>
                <p>{issue.message}</p>
                {issue.related.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {issue.related.map((key) => (
                      <li key={key}>
                        <RuleLink ruleKey={key} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {issue.resolution ? <p className="text-muted-foreground">Resolved: {issue.resolution.note}</p> : null}
              </div>
              {isOpen && onResolve && resolving !== index ? (
                <Button variant="outline" size="sm" onClick={() => setResolving(index)}>
                  Resolve
                </Button>
              ) : null}
            </div>
            {resolving === index ? (
              <div className="flex flex-col gap-2 pl-6">
                <Field>
                  <FieldLabel htmlFor={`resolve-${index}`}>Why it’s resolved</FieldLabel>
                  <Textarea id={`resolve-${index}`} value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!note.trim()} onClick={() => void resolve(index)}>
                    Save the note
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setResolving(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
