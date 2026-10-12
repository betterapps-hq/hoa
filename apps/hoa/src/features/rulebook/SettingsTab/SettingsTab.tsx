import { useDebouncedValue } from "@mantine/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { approvalBlockers } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { IssueList } from "../IssueList/IssueList"
import { ProblemList } from "../ProblemList/ProblemList"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import { citedProvision, countOf } from "../rulebookRecords"
import { remedyLabels } from "../ruleLabels"
import { Statement } from "../Statement/Statement"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import {
  checkClause,
  clauseCitations,
  clauseNames,
  clauseTitles,
  describeClause,
  type ClauseName
} from "./SettingsTab.utils"

const actionLabels: Record<T.RecommendedAction, string> = {
  "approve-with-conditions": "Approve with conditions",
  deny: "Deny",
  "request-information": "Ask for information",
  "refer-to-committee": "Refer to the committee"
}
const recommendedActions: T.RecommendedAction[] = [
  "approve-with-conditions",
  "deny",
  "request-information",
  "refer-to-committee"
]
const actionChoices = recommendedActions.map((value) => ({ value, label: actionLabels[value] }))
const remedies: T.RuleRemedy[] = ["change-detail", "redesign", "none"]

/**
 * The rulebook's settings (encoding.md, UX, Settings): each clause in words with its citations, editable as JSON, and
 * the organization's policy; the settings are reviewed like every record.
 */
export function SettingsTab() {
  const { records, issues, approval, actions } = useRulebookWorkspace()
  const { settings } = records
  const blockers = approval ? approvalBlockers(approval, { type: "settings" }) : []
  return (
    <div className="flex flex-col gap-4">
      {actions ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Review the settings</CardTitle>
            <CardDescription>
              They&rsquo;re published with the rules, so they&rsquo;re approved like a rule.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {settings.issues.length > 0 || (issues.get("settings") ?? []).length > 0 ? (
              <IssueList
                issues={settings.issues}
                found={issues.get("settings") ?? []}
                onResolve={(index, note) => actions.resolveIssue({ type: "settings" }, index, note)}
              />
            ) : null}
            <ReviewControls record={{ type: "settings" }} status={settings.review.status} blockers={blockers} />
          </CardContent>
        </Card>
      ) : null}
      {clauseNames.map((name) => (
        <ClauseCard key={name} name={name} />
      ))}
      <PolicyCard />
    </div>
  )
}

function ClauseCard({ name }: { name: ClauseName }) {
  const { records, vocabulary, citations, source, actions } = useRulebookWorkspace()
  const { clauses } = records.settings
  const [text, setText] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [settled] = useDebouncedValue(text, 300)
  const cited = [
    ...new Map(clauseCitations(name, clauses).map((citation) => [citation.provisionKey, citation])).values()
  ]
  const checked = settled === null ? null : checkClause(records, name, settled)

  const save = async () => {
    if (!actions || !checked?.clauses || settled !== text) {
      return
    }
    setIsSaving(true)
    const { clauses: changed } = checked
    const found = await attempt(
      () => actions.saveSettings({ clauses: changed, policy: null }),
      "The settings weren't saved."
    )
    setIsSaving(false)
    if (found) {
      setText(null)
      toast.success(found.length > 0 ? `Saved, with ${countOf(found.length, "problem", "problems")} to fix.` : "Saved.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{clauseTitles[name]}</CardTitle>
        {actions && text === null ? (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setText(JSON.stringify(clauses[name], null, 2))}>
              Edit
              <span className="sr-only"> {clauseTitles[name]}</span>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {text === null ? (
          <>
            {describeClause(name, clauses, vocabulary).map((line) => (
              <p key={line}>
                <Statement text={line} vocabulary={vocabulary} />
              </p>
            ))}
            {cited.length > 0 ? (
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="text-muted-foreground">Cited:</span>
                {cited.map((citation) => (
                  <ProvisionReference
                    key={citation.provisionKey}
                    citation={citedProvision(citations, citation)}
                    source={source}
                  />
                ))}
              </p>
            ) : (
              <p className="text-muted-foreground">The documents say nothing about it; this is the default.</p>
            )}
          </>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor={`clause-${name}`}>{clauseTitles[name]} as JSON</FieldLabel>
              <Textarea
                id={`clause-${name}`}
                className="min-h-64 font-mono text-xs"
                spellCheck={false}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            <ProblemList problems={checked?.problems ?? []} />
            <div className="flex gap-2">
              <Button disabled={!checked?.clauses || settled !== text || isSaving} onClick={() => void save()}>
                {isSaving ? "Saving" : "Save the clause"}
              </Button>
              <Button variant="ghost" onClick={() => setText(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PolicyCard() {
  const { records, actions } = useRulebookWorkspace()
  const { policy } = records.settings
  const [draft, setDraft] = useState(policy)
  const [isSaving, setIsSaving] = useState(false)
  const isChanged = JSON.stringify(draft) !== JSON.stringify(policy)
  const thresholdOf = (text: string) => Math.min(1, Math.max(0, Number(text) || 0))
  const save = async () => {
    if (!actions) {
      return
    }
    setIsSaving(true)
    await attempt(() => actions.saveSettings({ clauses: {}, policy: draft }), "The policy wasn't saved.")
    setIsSaving(false)
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>The organization’s policy</CardTitle>
        <CardDescription>
          Its own choices, not the documents’: what a review recommends, and how sure it must be.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          {remedies.map((remedy) => (
            <Field key={remedy}>
              <FieldLabel htmlFor={`policy-${remedy}`}>
                Not met, fixed by: {remedyLabels[remedy].toLowerCase()}
              </FieldLabel>
              {actions ? (
                <ChoiceSelect
                  id={`policy-${remedy}`}
                  value={draft.decisionPolicy[remedy]}
                  choices={actionChoices}
                  onChange={(action) =>
                    setDraft((current) => ({
                      ...current,
                      decisionPolicy: { ...current.decisionPolicy, [remedy]: action }
                    }))
                  }
                />
              ) : (
                <span id={`policy-${remedy}`}>{actionLabels[policy.decisionPolicy[remedy]]}</span>
              )}
            </Field>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["factConfidence", "judgmentConfidence"] as const).map((threshold) => (
            <Field key={threshold}>
              <FieldLabel htmlFor={`policy-${threshold}`}>
                {threshold === "factConfidence"
                  ? "Facts count from this confidence"
                  : "Judgments count from this confidence"}
              </FieldLabel>
              <Input
                id={`policy-${threshold}`}
                type="number"
                min={0}
                max={1}
                step={0.05}
                readOnly={!actions}
                value={draft.thresholds[threshold]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    thresholds: { ...current.thresholds, [threshold]: thresholdOf(event.target.value) }
                  }))
                }
              />
            </Field>
          ))}
        </div>
        {actions ? (
          <div className="flex gap-2">
            <Button disabled={!isChanged || isSaving} onClick={() => void save()}>
              {isSaving ? "Saving" : "Save the policy"}
            </Button>
            {isChanged ? (
              <Button variant="ghost" onClick={() => setDraft(policy)}>
                Undo the changes
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
