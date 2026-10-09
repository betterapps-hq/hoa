import { PlusIcon, Trash2Icon } from "lucide-react"
import { match } from "ts-pattern"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { describeCondition } from "@/schema/describe"
import type * as T from "@/schema/types"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { OperandEditor } from "../OperandEditor/OperandEditor"
import { propertyOf } from "../OperandEditor/OperandEditor.utils"
import { TermListPicker } from "../TermListPicker/TermListPicker"
import { termFilters, termOptions, type TermCatalog } from "../TermPicker/TermPicker.utils"
import {
  comparatorLabels,
  conditionKindLabels,
  convertCondition,
  editableConditionKinds,
  isEditableCondition,
  newCondition
} from "./ConditionEditor.utils"

export type ConditionEditorProps = {
  /** Names the condition for screen readers and ids, such as "Applies when". */
  label: string
  value: T.Condition
  onChange: (value: T.Condition) => void
  catalog: TermCatalog
  subject: T.TermKey | null
  /** Shown for a condition inside a group, which can be removed. */
  onRemove?: () => void
}

const kindChoices = editableConditionKinds.map((kind) => ({ value: kind, label: conditionKindLabels[kind] }))
const comparators: T.Comparator[] = ["=", "!=", "<", "<=", ">", ">="]
const comparatorChoices = comparators.map((op) => ({ value: op, label: comparatorLabels[op] }))

/**
 * Edits a condition of the common shapes: a comparison, a list of values, a range, and all or any of other conditions.
 * Anything else shows as words, to be edited as JSON.
 */
export function ConditionEditor({ label, value, onChange, catalog, subject, onRemove }: ConditionEditorProps) {
  const remove = onRemove ? (
    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} onClick={onRemove}>
      <Trash2Icon />
    </Button>
  ) : null
  if (!isEditableCondition(value)) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed p-3">
        <p className="flex-1 text-sm">
          {describeCondition(value, catalog.vocabulary)}{" "}
          <span className="text-muted-foreground">(edit this condition as JSON)</span>
        </p>
        {remove}
      </div>
    )
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-2">
        <ChoiceSelect
          label={`${label}: kind`}
          value={value.type}
          choices={kindChoices}
          onChange={(kind) => onChange(convertCondition(value, kind))}
        />
        <span className="flex-1" />
        {remove}
      </div>
      {match(value)
        .with({ type: "compare" }, (compare) => (
          <div className="flex flex-col gap-2">
            <OperandEditor
              label={`${label}: left side`}
              value={compare.left}
              other={compare.right}
              onChange={(left) => onChange({ ...compare, left })}
              catalog={catalog}
              subject={subject}
            />
            <ChoiceSelect
              label={`${label}: comparison`}
              value={compare.op}
              choices={comparatorChoices}
              onChange={(op) => onChange({ ...compare, op })}
            />
            <OperandEditor
              label={`${label}: right side`}
              value={compare.right}
              other={compare.left}
              onChange={(right) => onChange({ ...compare, right })}
              catalog={catalog}
              subject={subject}
            />
          </div>
        ))
        .with({ type: "in" }, (inList) => {
          const property = propertyOf(inList.left, catalog.vocabulary)
          const set = property?.valueType.type === "choice" ? property.valueType.set : null
          const isValueList = inList.values.every((item) => item.type === "value")
          return (
            <div className="flex flex-col gap-2">
              <OperandEditor
                label={`${label}: fact`}
                value={inList.left}
                onChange={(left) => onChange({ ...inList, left })}
                catalog={catalog}
                subject={subject}
              />
              {isValueList ? (
                <TermListPicker
                  label={`${label}: values`}
                  values={inList.values.flatMap((item) => (item.type === "value" ? [item.term] : []))}
                  options={termOptions(catalog, termFilters.valuesOf(set))}
                  onChange={(keys) => onChange({ ...inList, values: keys.map((term) => ({ type: "value", term })) })}
                  placeholder="Add a value"
                />
              ) : (
                <p className="text-sm text-muted-foreground">These values are calculated; edit them as JSON.</p>
              )}
            </div>
          )
        })
        .with({ type: "between" }, (between) => (
          <div className="flex flex-col gap-2">
            <OperandEditor
              label={`${label}: fact`}
              value={between.left}
              onChange={(left) => onChange({ ...between, left })}
              catalog={catalog}
              subject={subject}
            />
            <OperandEditor
              label={`${label}: lowest`}
              value={between.min}
              other={between.left}
              onChange={(min) => onChange({ ...between, min })}
              catalog={catalog}
              subject={subject}
            />
            <OperandEditor
              label={`${label}: highest`}
              value={between.max}
              other={between.left}
              onChange={(max) => onChange({ ...between, max })}
              catalog={catalog}
              subject={subject}
            />
            <div className="flex flex-wrap gap-4">
              {(["includeMin", "includeMax"] as const).map((bound) => {
                const id = `${label}-${bound}`.replaceAll(/\W+/g, "-")
                return (
                  <div key={bound} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={between[bound]}
                      onCheckedChange={(checked) => onChange({ ...between, [bound]: checked === true })}
                    />
                    <Label htmlFor={id}>
                      {bound === "includeMin" ? "Includes the lowest" : "Includes the highest"}
                    </Label>
                  </div>
                )
              })}
            </div>
          </div>
        ))
        .with({ type: "all" }, { type: "any" }, (group) => (
          <div className="flex flex-col gap-2">
            {group.of.map((child, index) => (
              <ConditionEditor
                // Children have no identity but their place; editing never reorders them.
                key={index}
                label={`${label}, condition ${index + 1}`}
                value={child}
                onChange={(next) => onChange({ ...group, of: group.of.map((item, i) => (i === index ? next : item)) })}
                onRemove={() => onChange({ ...group, of: group.of.filter((_, i) => i !== index) })}
                catalog={catalog}
                subject={subject}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => onChange({ ...group, of: [...group.of, newCondition()] })}
            >
              <PlusIcon />
              Add a condition
            </Button>
          </div>
        ))
        .exhaustive()}
    </fieldset>
  )
}
