import { useDebouncedValue } from "@mantine/hooks"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type * as T from "@/schema/types"
import type { RuleDraft } from "@/schema/zod"
import { parseJson } from "../parseJson"
import { ProblemList } from "../ProblemList/ProblemList"
import { draftOf, ruleProblems } from "../ruleProblems"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type RuleJsonEditorProps = {
  rule: T.Rule
  /** Saves the draft, reporting its own errors. */
  onSave: (draft: RuleDraft) => Promise<void>
  onCancel: () => void
}

/** Any rule as JSON, checked by the schema's Zod and against the rest of the rulebook as it's typed. */
export function RuleJsonEditor({ rule, onSave, onCancel }: RuleJsonEditorProps) {
  const { records } = useRulebookWorkspace()
  const [text, setText] = useState(() => JSON.stringify(draftOf(rule), null, 2))
  const [isSaving, setIsSaving] = useState(false)
  const [settled] = useDebouncedValue(text, 300)
  const json = parseJson(settled)
  const checked = json.error === null ? ruleProblems(records, rule, json.value) : null
  const draft = settled === text ? (checked?.draft ?? null) : null

  const save = async () => {
    if (!draft) {
      return
    }
    setIsSaving(true)
    await onSave(draft)
    setIsSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="rule-json">The rule as JSON</FieldLabel>
        <Textarea
          id="rule-json"
          className="min-h-96 font-mono text-xs"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <FieldDescription>
          Every field of the rule, without its review and issues. Its key can’t change.
        </FieldDescription>
      </Field>
      <section className="flex flex-col gap-2" aria-labelledby="rule-json-problems">
        <h3 id="rule-json-problems" className="text-sm font-medium">
          Problems
        </h3>
        {json.error ? (
          <p className="text-sm text-destructive" role="alert">
            {json.error}
          </p>
        ) : (
          <ProblemList problems={checked?.problems ?? []} />
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!draft || isSaving} onClick={() => void save()}>
          {isSaving ? "Saving" : "Save the rule"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
