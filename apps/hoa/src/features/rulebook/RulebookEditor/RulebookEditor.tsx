import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { Notice } from "@/components/Notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Rule } from "@/rules/rules"
import { RuleCard } from "../RuleCard/RuleCard"
import {
  approvedRules,
  countDecisions,
  editorSchema,
  newRuleDraft,
  toDrafts,
  type EditorValues
} from "./RulebookEditor.utils"

export type RulebookEditorProps = {
  hoaName: string
  documents: string[]
  rules: Rule[]
  onPublish: (rules: Rule[]) => Promise<void>
}

/** The rep reviews every extracted rule, edits it, approves or rejects it, and publishes the approved ones. */
export function RulebookEditor({ hoaName, documents, rules, onPublish }: RulebookEditorProps) {
  const form = useForm<EditorValues>({ resolver: zodResolver(editorSchema), defaultValues: { rules: toDrafts(rules) } })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "rules", keyName: "key" })
  const drafts = useWatch({ control: form.control, name: "rules" })
  const counts = countDecisions(drafts)
  const [publishError, setPublishError] = useState<string>()

  function approvePending() {
    drafts.forEach((draft, index) => {
      if (draft.decision === "pending") {
        form.setValue(`rules.${index}.decision`, "approved")
      }
    })
  }

  const handlePublish = form.handleSubmit(async (values) => {
    setPublishError(undefined)
    try {
      await onPublish(approvedRules(values.rules))
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "The rulebook couldn't be published.")
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={handlePublish} noValidate className="space-y-6">
        <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
              <span className="font-semibold">{hoaName}</span>
              <Badge variant="outline">{counts.approved} approved</Badge>
              <Badge variant="outline">{counts.rejected} rejected</Badge>
              <Badge variant="outline">{counts.pending} waiting for a decision</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={approvePending} disabled={counts.pending === 0}>
                Approve remaining rules
              </Button>
              <Button type="submit" disabled={counts.approved === 0 || form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Publishing" : `Publish ${counts.approved} approved rules`}
              </Button>
            </div>
          </div>
        </div>

        {counts.pending > 0 && (
          <Notice tone="info">
            Only approved rules are published. Rules still waiting for a decision are left out.
          </Notice>
        )}
        {form.formState.errors.rules && (
          <Notice tone="danger">Some rules have missing fields. Fix the highlighted fields, then publish again.</Notice>
        )}
        {publishError && <Notice tone="danger">{publishError}</Notice>}

        <ol className="space-y-4">
          {fields.map((field, index) => (
            <li key={field.key}>
              <RuleCard index={index} documents={documents} onRemove={() => remove(index)} />
            </li>
          ))}
        </ol>

        <Button variant="outline" onClick={() => append(newRuleDraft(documents[0] ?? ""))}>
          <PlusIcon />
          Add a rule
        </Button>
      </form>
    </FormProvider>
  )
}
