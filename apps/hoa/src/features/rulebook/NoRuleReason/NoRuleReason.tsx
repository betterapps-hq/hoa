import { CheckIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { isCited } from "@/rulebook/coverage"
import type * as T from "@/schema/types"
import { attempt, reviewRecord } from "../attempt"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { noRuleReasonLabels, reviewLabels } from "../ruleLabels"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

const reasons: T.NoRule["reason"][] = ["heading", "recital", "reserved", "explanatory", "duplicate", "not-evaluated"]
const reasonChoices = reasons.map((reason) => ({ value: reason, label: noRuleReasonLabels[reason] }))

export type NoRuleReasonProps = { provision: T.Provision }

/**
 * A provision's reason for having no rule and its review; in a draft, a way to approve, change or remove it, or to give
 * one to a provision nothing covers.
 */
export function NoRuleReason({ provision }: NoRuleReasonProps) {
  const { coverage, actions } = useRulebookWorkspace()
  const [isEditing, setIsEditing] = useState(false)
  const [reason, setReason] = useState<T.NoRule["reason"]>(provision.noRule?.reason ?? "explanatory")
  const [note, setNote] = useState(provision.noRule?.note ?? "")
  const [isBusy, setIsBusy] = useState(false)
  const isUncovered = provision.noRule === null && !isCited(coverage.byProvision.get(provision.key))
  const fieldId = `reason-${provision.key.replaceAll(/\W+/g, "-")}`

  const setNoRule = async (noRule: { reason: T.NoRule["reason"]; note: string | null } | null) => {
    if (!actions) {
      return
    }
    setIsBusy(true)
    const done = await attempt(async () => {
      await actions.setNoRule(provision.key, noRule)
      return true
    }, "The reason wasn't saved.")
    setIsBusy(false)
    if (done) {
      setIsEditing(false)
    }
  }

  return (
    <>
      {provision.noRule ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>No rule: {noRuleReasonLabels[provision.noRule.reason]}</span>
          <Badge variant="outline">{reviewLabels[provision.noRule.review.status]}</Badge>
          {provision.noRule.note ? <span className="text-muted-foreground">{provision.noRule.note}</span> : null}
        </div>
      ) : null}
      {actions && !isEditing ? (
        <div className="flex flex-wrap gap-2">
          {provision.noRule?.review.status === "proposed" ? (
            <Button
              size="sm"
              disabled={isBusy}
              onClick={() => {
                setIsBusy(true)
                void reviewRecord(actions, { type: "provision", key: provision.key }, "approved").finally(() =>
                  setIsBusy(false)
                )
              }}
            >
              <CheckIcon />
              Approve the reason
            </Button>
          ) : null}
          {provision.noRule || isUncovered ? (
            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => setIsEditing(true)}>
              {provision.noRule ? "Change the reason" : "Give a reason for having no rule"}
            </Button>
          ) : null}
          {provision.noRule ? (
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => void setNoRule(null)}>
              Remove the reason
            </Button>
          ) : null}
        </div>
      ) : null}
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={fieldId}>Reason</FieldLabel>
              <ChoiceSelect id={fieldId} value={reason} choices={reasonChoices} onChange={setReason} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-note`}>Note</FieldLabel>
              <Input id={`${fieldId}-note`} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={isBusy} onClick={() => void setNoRule({ reason, note: note.trim() || null })}>
              Save the reason
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
