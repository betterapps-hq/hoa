import { match } from "ts-pattern"
import { Input } from "@/components/ui/input"
import type * as T from "@/schema/types"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { TermPicker } from "../TermPicker/TermPicker"
import { termFilters, termOptions, type TermCatalog } from "../TermPicker/TermPicker.utils"
import {
  defaultOperand,
  editableOperandKinds,
  isEditableOperand,
  operandKindLabels,
  pathLabel,
  propertyOf
} from "./OperandEditor.utils"

export type OperandEditorProps = {
  /** Names the operand for screen readers, such as "Left side". */
  label: string
  value: T.Operand
  onChange: (value: T.Operand) => void
  catalog: TermCatalog
  /** The thing the rule is about, whose properties a fact can read. */
  subject: T.TermKey | null
  /** The other side of a comparison, which suggests units and values. */
  other?: T.Operand
}

const kindChoices = editableOperandKinds.map((kind) => ({ value: kind, label: operandKindLabels[kind] }))

const numberOf = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? 0 : Number(text))

/** Edits one side of a condition: a fact about the subject, an amount, a number, a listed value, yes or no, or a date. */
export function OperandEditor({ label, value, onChange, catalog, subject, other }: OperandEditorProps) {
  const { vocabulary } = catalog
  const otherProperty = other ? propertyOf(other, vocabulary) : undefined
  if (!isEditableOperand(value)) {
    return (
      <p className="text-sm text-muted-foreground">
        {label}: a calculation this editor can’t change. Edit the rule as JSON to change it.
      </p>
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ChoiceSelect
        label={`${label}: kind`}
        value={value.type}
        choices={kindChoices}
        onChange={(kind) => onChange(defaultOperand(kind, otherProperty))}
      />
      {match(value)
        .with({ type: "ref" }, (ref) =>
          ref.path.length > 1 || (ref.from ?? "subject") !== "subject" ? (
            <span className="text-sm">
              {pathLabel(ref, vocabulary)}{" "}
              <span className="text-muted-foreground">(a path through other things; edit it as JSON)</span>
            </span>
          ) : (
            <div className="min-w-48 flex-1">
              <TermPicker
                label={`${label}: fact`}
                value={ref.path[0] ?? null}
                options={termOptions(catalog, termFilters.propertiesOf(vocabulary, subject))}
                onChange={(key) => onChange({ type: "ref", path: key ? [key] : [] })}
                placeholder="Choose a property"
              />
            </div>
          )
        )
        .with({ type: "quantity" }, (quantity) => {
          const unit = vocabulary.get(quantity.unit)
          return (
            <>
              <Input
                type="number"
                aria-label={`${label}: amount`}
                className="w-28"
                value={quantity.value}
                onChange={(event) => onChange({ ...quantity, value: numberOf(event.target.value) })}
              />
              <div className="min-w-36 flex-1">
                <TermPicker
                  label={`${label}: unit`}
                  value={quantity.unit}
                  options={termOptions(catalog, termFilters.units(unit?.kind === "unit" ? unit.dimension : null))}
                  onChange={(key) => (key ? onChange({ ...quantity, unit: key }) : undefined)}
                />
              </div>
            </>
          )
        })
        .with({ type: "number" }, (number) => (
          <Input
            type="number"
            aria-label={`${label}: number`}
            className="w-28"
            value={number.value}
            onChange={(event) => onChange({ type: "number", value: numberOf(event.target.value) })}
          />
        ))
        .with({ type: "value" }, (item) => {
          const set = otherProperty?.valueType.type === "choice" ? otherProperty.valueType.set : null
          return (
            <div className="min-w-48 flex-1">
              <TermPicker
                label={`${label}: value`}
                value={item.term === "" ? null : item.term}
                options={termOptions(catalog, termFilters.valuesOf(set))}
                onChange={(key) => onChange({ type: "value", term: key ?? "" })}
                placeholder="Choose a value"
              />
            </div>
          )
        })
        .with({ type: "boolean" }, (boolean) => (
          <ChoiceSelect
            label={`${label}: yes or no`}
            value={boolean.value ? "yes" : "no"}
            choices={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
            onChange={(choice) => onChange({ type: "boolean", value: choice === "yes" })}
          />
        ))
        .with({ type: "date" }, (date) => (
          <Input
            type="date"
            aria-label={`${label}: date`}
            className="w-44"
            value={date.value}
            onChange={(event) => onChange({ type: "date", value: event.target.value })}
          />
        ))
        .exhaustive()}
    </div>
  )
}
