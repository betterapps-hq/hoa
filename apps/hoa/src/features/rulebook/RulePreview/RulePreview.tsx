import { useState } from "react"
import { match, P } from "ts-pattern"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { pickableTerms } from "@/rulebook/ruleTerms"
import type * as T from "@/schema/types"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { relatedRules } from "../rulebookRecords"
import { TermPicker } from "../TermPicker/TermPicker"
import { termFilters, termOptions } from "../TermPicker/TermPicker.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import {
  factValue,
  isPreviewable,
  outcomeLabels,
  previewInputs,
  previewRule,
  type PreviewInput
} from "./RulePreview.utils"

export type RulePreviewProps = { rule: T.Rule }

const today = () => new Date().toISOString().slice(0, 10)

/** Evaluates the rule with the engine against facts typed here, to see what it decides before it's approved. */
export function RulePreview({ rule }: RulePreviewProps) {
  const { records, vocabulary } = useRulebookWorkspace()
  const [requestType, setRequestType] = useState(rule.requestTypes[0] ?? "")
  const [asOf, setAsOf] = useState(today)
  const [typed, setTyped] = useState<Record<string, string>>({})
  if (!isPreviewable(rule)) {
    return (
      <p className="text-sm text-muted-foreground">
        Only rules that state what must, mustn’t or should be done, about a kind of thing, are evaluated on their own.
        Permissions, discretion, sanctions and limits act through the rules they change.
      </p>
    )
  }
  const catalog = { vocabulary, terms: pickableTerms(records.terms) }
  const overriders = relatedRules(rule, records.rules).overriddenBy.flatMap((key) =>
    records.rules.filter((item) => item.key === key)
  )
  const { inputs, untypable } = previewInputs(rule, vocabulary, overriders)
  const facts = inputs.flatMap((input) => {
    const value = factValue(input.property, typed[input.id] ?? "", vocabulary)
    return value ? [{ root: input.root, property: input.property.key, value }] : []
  })
  const { findings, error } = previewRule(records, rule, { requestType, asOf: asOf || today(), facts })
  const nameOf = (input: PreviewInput) => {
    const label = vocabulary.label(input.property.key)
    return input.root === "subject" ? label.charAt(0).toUpperCase() + label.slice(1) : `The ${input.root}’s ${label}`
  }
  const setFact = (id: string, text: string) => setTyped((current) => ({ ...current, [id]: text }))

  function factInput(input: PreviewInput) {
    const id = `preview-${input.id.replaceAll(/\W+/g, "-")}`
    const text = typed[input.id] ?? ""
    return match(input.property.valueType)
      .with({ type: "choice" }, ({ set }) => (
        <TermPicker
          id={id}
          label={nameOf(input)}
          value={text || null}
          options={termOptions(catalog, termFilters.valuesOf(set))}
          onChange={(key) => setFact(input.id, key ?? "")}
          isClearable
          placeholder="Not stated"
        />
      ))
      .with({ type: "party" }, () => (
        <TermPicker
          id={id}
          label={nameOf(input)}
          value={text || null}
          options={termOptions(catalog, termFilters.parties(vocabulary))}
          onChange={(key) => setFact(input.id, key ?? "")}
          isClearable
          placeholder="Not stated"
        />
      ))
      .with({ type: "boolean" }, () => (
        <ChoiceSelect
          id={id}
          value={text === "yes" || text === "no" ? text : "unstated"}
          choices={[
            { value: "unstated", label: "Not stated" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
          ]}
          onChange={(choice) => setFact(input.id, choice === "unstated" ? "" : choice)}
        />
      ))
      .otherwise((valueType) => {
        const type = match(valueType.type)
          .with(P.union("quantity", "count"), () => "number")
          .with("date", () => "date")
          .with("date-time", () => "datetime-local")
          .with("time-of-day", () => "time")
          .otherwise(() => "text")
        return (
          <Input
            id={id}
            type={type}
            value={text}
            placeholder="Not stated"
            onChange={(event) => setFact(input.id, event.target.value)}
          />
        )
      })
  }

  const unit = (input: PreviewInput) =>
    input.property.valueType.type === "quantity" ? ` (${vocabulary.label(input.property.valueType.unit)})` : ""

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="preview-request-type">Request</FieldLabel>
          <ChoiceSelect
            id="preview-request-type"
            value={requestType}
            choices={rule.requestTypes.map((key) => ({ value: key, label: vocabulary.label(key) }))}
            onChange={setRequestType}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="preview-as-of">As of</FieldLabel>
          <Input id="preview-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </Field>
      </div>
      {inputs.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {inputs.map((input) => (
            <Field key={input.id}>
              <FieldLabel htmlFor={`preview-${input.id.replaceAll(/\W+/g, "-")}`}>
                {nameOf(input)}
                {unit(input)}
              </FieldLabel>
              {factInput(input)}
            </Field>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">The rule reads no facts that can be typed here.</p>
      )}
      {untypable.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Not typed here: {untypable.join(" and ")}. The engine treats them as not provided.
        </p>
      ) : null}
      <section
        className="flex flex-col gap-2 rounded-md border p-3"
        aria-live="polite"
        aria-label="What the rule decides"
      >
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {findings.map((finding) => (
          <div key={finding.entity} className="flex flex-col gap-1">
            <div>
              <Badge variant={finding.outcome === "not-met" ? "destructive" : "outline"}>
                {outcomeLabels[finding.outcome]}
              </Badge>
            </div>
            <p className="text-sm">{finding.reason}</p>
          </div>
        ))}
        {!error && findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">The rule isn’t considered in this request on this date.</p>
        ) : null}
      </section>
    </div>
  )
}
