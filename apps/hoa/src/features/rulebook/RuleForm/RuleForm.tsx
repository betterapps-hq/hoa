import { useDebouncedValue } from "@mantine/hooks"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { pickableTerms } from "@/rulebook/ruleTerms"
import type * as T from "@/schema/types"
import type { RuleContent, RuleDraft } from "@/schema/zod"
import { CheckEditor } from "../CheckEditor/CheckEditor"
import { newCheck } from "../CheckEditor/CheckEditor.utils"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { ConditionEditor } from "../ConditionEditor/ConditionEditor"
import { newCondition } from "../ConditionEditor/ConditionEditor.utils"
import { ProblemList } from "../ProblemList/ProblemList"
import { draftOf, ruleProblems } from "../ruleProblems"
import { Statement } from "../Statement/Statement"
import { TermListPicker } from "../TermListPicker/TermListPicker"
import { TermPicker } from "../TermPicker/TermPicker"
import { termFilters, termOptions } from "../TermPicker/TermPicker.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import {
  domainChoices,
  fieldErrors,
  fieldsOf,
  modalityChoices,
  needsCheck,
  remedyChoices,
  withFields,
  type RuleStructure
} from "./RuleForm.utils"

export type RuleFormProps = {
  rule: T.Rule
  /** Saves the draft, reporting its own errors. */
  onSave: (draft: RuleDraft) => Promise<void>
  onCancel: () => void
}

const errorsOf = (errors: unknown[]) =>
  errors.flatMap((error) =>
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? [{ message: error.message }]
      : []
  )

/**
 * Edits a rule's title, statement, modality, bearer, remedy, request types, applicability and check, checking the
 * edit against the schema and the rest of the rulebook as it changes (encoding.md, UX, Editing).
 */
export function RuleForm({ rule, onSave, onCancel }: RuleFormProps) {
  const { records, vocabulary } = useRulebookWorkspace()
  const draft = draftOf(rule)
  const [structure, setStructure] = useState<RuleStructure>({
    appliesWhen: draft.appliesWhen,
    check: draft.kind === "norm" ? draft.check : null
  })
  const catalog = { vocabulary, terms: pickableTerms(records.terms) }
  const parties = termOptions(catalog, termFilters.parties(vocabulary))
  const form = useForm({
    defaultValues: fieldsOf(draft),
    validators: { onChange: ({ value }) => fieldErrors(withFields(draft, value, structure)) },
    onSubmit: async ({ value }) => {
      await onSave(withFields(draft, value, structure))
    }
  })
  const setCheck = (check: T.Check | null) => setStructure((current) => ({ ...current, check }))

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="title">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="rule-title">Title</FieldLabel>
              <Input
                id="rule-title"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError errors={errorsOf(field.state.meta.errors)} />
            </Field>
          )}
        </form.Field>
        <form.Field name="statement">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="rule-statement">Statement</FieldLabel>
              <Textarea
                id="rule-statement"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldDescription>
                Link a term by its key in double braces, such as {"{{lot}}"}. It reads:{" "}
                <Statement text={field.state.value} vocabulary={vocabulary} />
              </FieldDescription>
              <FieldError errors={errorsOf(field.state.meta.errors)} />
            </Field>
          )}
        </form.Field>
        <form.Field name="domain">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="rule-domain">Domain</FieldLabel>
              <ChoiceSelect
                id="rule-domain"
                value={field.state.value}
                choices={domainChoices}
                onChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="requestTypes">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="rule-request-types">Request types</FieldLabel>
              <TermListPicker
                id="rule-request-types"
                label="Request types"
                values={field.state.value}
                options={termOptions(catalog, termFilters.requestTypes)}
                onChange={field.handleChange}
                placeholder="Add a request type"
              />
              <FieldError errors={errorsOf(field.state.meta.errors)} />
            </Field>
          )}
        </form.Field>
        <form.Field name="appliesTo">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="rule-applies-to">Applies to</FieldLabel>
              <TermPicker
                id="rule-applies-to"
                label="Applies to"
                value={field.state.value}
                options={termOptions(catalog, termFilters.subjects)}
                onChange={field.handleChange}
                isClearable
                isInvalid={field.state.meta.errors.length > 0}
              />
              <FieldError errors={errorsOf(field.state.meta.errors)} />
            </Field>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.appliesTo}>
          {(subject) => (
            <Field>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rule-applies-when"
                  checked={structure.appliesWhen !== null}
                  onCheckedChange={(checked) =>
                    setStructure((current) => ({ ...current, appliesWhen: checked === true ? newCondition() : null }))
                  }
                />
                <Label htmlFor="rule-applies-when">Only when a condition holds</Label>
              </div>
              {structure.appliesWhen ? (
                <ConditionEditor
                  label="Applies when"
                  value={structure.appliesWhen}
                  onChange={(appliesWhen) => setStructure((current) => ({ ...current, appliesWhen }))}
                  catalog={catalog}
                  subject={subject}
                />
              ) : null}
            </Field>
          )}
        </form.Subscribe>
        {draft.kind === "norm" ? (
          <>
            <form.Field name="modality">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="rule-modality">Modality</FieldLabel>
                  <ChoiceSelect
                    id="rule-modality"
                    value={field.state.value}
                    choices={modalityChoices}
                    onChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="bearer">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="rule-bearer">Bearer</FieldLabel>
                  <TermPicker
                    id="rule-bearer"
                    label="Bearer"
                    value={field.state.value}
                    options={parties}
                    onChange={field.handleChange}
                    isClearable
                    isInvalid={field.state.meta.errors.length > 0}
                    placeholder="Who must comply"
                  />
                  <FieldDescription>A requirement has no bearer; every other rule has one.</FieldDescription>
                  <FieldError errors={errorsOf(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="remedy">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="rule-remedy">Remedy</FieldLabel>
                  <ChoiceSelect
                    id="rule-remedy"
                    value={field.state.value ?? "no-remedy"}
                    choices={remedyChoices}
                    onChange={(remedy) => field.handleChange(remedy === "no-remedy" ? null : remedy)}
                  />
                  <FieldError errors={errorsOf(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="decidedBy">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="rule-decided-by">Decided by</FieldLabel>
                  <TermPicker
                    id="rule-decided-by"
                    label="Decided by"
                    value={field.state.value}
                    options={parties}
                    onChange={field.handleChange}
                    isClearable
                    placeholder="Who decides a judgment"
                  />
                  <FieldError errors={errorsOf(field.state.meta.errors)} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => [state.values.modality, state.values.appliesTo] as const}>
              {([modality, subject]) => (
                <Field>
                  <span className="text-sm font-medium">Check</span>
                  {structure.check ? (
                    <>
                      <CheckEditor value={structure.check} onChange={setCheck} catalog={catalog} subject={subject} />
                      {needsCheck(modality) ? null : (
                        <Button variant="outline" size="sm" className="w-fit" onClick={() => setCheck(null)}>
                          Remove the check: a {modality} has none
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="w-fit" onClick={() => setCheck(newCheck("test"))}>
                      Add a check
                    </Button>
                  )}
                </Field>
              )}
            </form.Subscribe>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">The rest of a {draft.kind} rule is edited as JSON.</p>
        )}
      </FieldGroup>

      <section className="flex flex-col gap-2" aria-labelledby="rule-form-problems">
        <h3 id="rule-form-problems" className="text-sm font-medium">
          Problems
        </h3>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => <RuleFormProblems rule={rule} candidate={withFields(draft, values, structure)} />}
        </form.Subscribe>
      </section>

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Saving" : "Save the rule"}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}

/** The edit's problems, checked a moment after typing stops, since checking reads the whole rulebook. */
function RuleFormProblems({ rule, candidate }: { rule: T.Rule; candidate: RuleContent }) {
  const { records } = useRulebookWorkspace()
  const [settled] = useDebouncedValue(candidate, 300)
  return <ProblemList problems={ruleProblems(records, rule, settled).problems} />
}
