import { PlusIcon, Trash2Icon } from "lucide-react"
import { match } from "ts-pattern"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { describeCheck } from "@/schema/describe"
import type * as T from "@/schema/types"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { ConditionEditor } from "../ConditionEditor/ConditionEditor"
import { OperandEditor } from "../OperandEditor/OperandEditor"
import { pathLabel, propertyOf } from "../OperandEditor/OperandEditor.utils"
import { TermListPicker } from "../TermListPicker/TermListPicker"
import { TermPicker } from "../TermPicker/TermPicker"
import { termFilters, termOptions, type TermCatalog } from "../TermPicker/TermPicker.utils"
import {
  addTableInput,
  cellKindLabels,
  cellKinds,
  checkKindLabels,
  editableCheckKinds,
  isEditableCheck,
  newCell,
  newCheck,
  newRow,
  removeTableInput
} from "./CheckEditor.utils"

export type CheckEditorProps = {
  value: T.Check
  onChange: (value: T.Check) => void
  catalog: TermCatalog
  subject: T.TermKey | null
}

const kindChoices = editableCheckKinds.map((kind) => ({ value: kind, label: checkKindLabels[kind] }))
const cellChoices = cellKinds.map((kind) => ({ value: kind, label: cellKindLabels[kind] }))
const resultChoices = [
  { value: "met", label: "Complies" },
  { value: "not-met", label: "Doesn't comply" }
] as const

type TableCheck = Extract<T.Check, { type: "table" }>

function CheckBox({
  id,
  label,
  checked,
  onChange
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

/**
 * Edits how a rule is checked, for the common shapes: a condition, a table, a document, an approval and a judgment.
 * A deadline shows as words, to be edited as JSON.
 */
export function CheckEditor({ value, onChange, catalog, subject }: CheckEditorProps) {
  const { vocabulary } = catalog
  if (!isEditableCheck(value)) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm">
        {describeCheck(value, vocabulary)} <span className="text-muted-foreground">(edit this check as JSON)</span>
      </p>
    )
  }
  const parties = termOptions(catalog, termFilters.parties(vocabulary))
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChoiceSelect
        label="Check: kind"
        value={value.type}
        choices={kindChoices}
        onChange={(kind) => (kind === value.type ? undefined : onChange(newCheck(kind)))}
      />
      {match(value)
        .with({ type: "test" }, (test) => (
          <ConditionEditor
            label="Complies when"
            value={test.test}
            onChange={(condition) => onChange({ type: "test", test: condition })}
            catalog={catalog}
            subject={subject}
          />
        ))
        .with({ type: "table" }, (table) => (
          <TableCheckEditor table={table} onChange={onChange} catalog={catalog} subject={subject} />
        ))
        .with({ type: "document" }, (document) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="check-document">Document</Label>
              <TermPicker
                id="check-document"
                value={document.document === "" ? null : document.document}
                options={termOptions(catalog, termFilters.documents(vocabulary))}
                onChange={(key) => onChange({ ...document, document: key ?? "" })}
                placeholder="Choose a document"
              />
            </div>
            <ChoiceSelect
              label="One for"
              value={document.per}
              choices={[
                { value: "request", label: "One for the request" },
                { value: "subject", label: "One for each subject" }
              ]}
              onChange={(per) => onChange({ ...document, per })}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">It must state</legend>
              {document.mustState.map((statement, index) => (
                // Statements have no identity but their place.
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Statement ${index + 1}`}
                    value={statement}
                    onChange={(event) =>
                      onChange({
                        ...document,
                        mustState: document.mustState.map((item, i) => (i === index ? event.target.value : item))
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove statement ${index + 1}`}
                    onClick={() =>
                      onChange({ ...document, mustState: document.mustState.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => onChange({ ...document, mustState: [...document.mustState, ""] })}
              >
                <PlusIcon />
                Add a statement
              </Button>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Signed by</span>
              <TermListPicker
                label="Signed by"
                values={document.signedBy}
                options={parties}
                onChange={(signedBy) => onChange({ ...document, signedBy })}
                placeholder="Add a party"
              />
            </div>
          </div>
        ))
        .with({ type: "approval" }, (approval) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Approved by</span>
              <TermListPicker
                label="Approved by"
                values={approval.by}
                options={parties}
                onChange={(by) => onChange({ ...approval, by })}
                placeholder="Add a party"
              />
            </div>
            <ChoiceSelect
              label="Approvals needed"
              value={approval.needs}
              choices={[
                { value: "all", label: "Every one of them" },
                { value: "any", label: "Any one of them" }
              ]}
              onChange={(needs) => onChange({ ...approval, needs })}
            />
            <CheckBox
              id="check-approval-prior"
              label="Before the governing date"
              checked={approval.prior}
              onChange={(prior) => onChange({ ...approval, prior })}
            />
            <CheckBox
              id="check-approval-written"
              label="In writing"
              checked={approval.written}
              onChange={(written) => onChange({ ...approval, written })}
            />
          </div>
        ))
        .with({ type: "judgment" }, (judgment) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="check-judgment-question">Question, phrased so that yes complies</Label>
              <Textarea
                id="check-judgment-question"
                value={judgment.question}
                onChange={(event) => onChange({ ...judgment, question: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Judged from</span>
              <TermListPicker
                label="Judged from"
                values={judgment.evidence}
                options={termOptions(catalog, termFilters.propertiesOf(vocabulary, subject))}
                onChange={(evidence) => onChange({ ...judgment, evidence })}
                placeholder="Add a property"
              />
            </div>
          </div>
        ))
        .exhaustive()}
    </div>
  )
}

type TableCheckEditorProps = {
  table: TableCheck
  onChange: (value: T.Check) => void
  catalog: TermCatalog
  subject: T.TermKey | null
}

/** A table's inputs, its rows of cells with their results, and what holds when no row matches. */
function TableCheckEditor({ table, onChange, catalog, subject }: TableCheckEditorProps) {
  const { vocabulary } = catalog
  const inputName = (index: number) => {
    const input = table.inputs[index]
    return input?.type === "ref" && input.path.length > 0 ? pathLabel(input, vocabulary) : `input ${index + 1}`
  }
  const setRow = (index: number, row: TableCheck["rows"][number]) =>
    onChange({ ...table, rows: table.rows.map((item, i) => (i === index ? row : item)) })

  function cellEditor(cell: T.Cell, inputIndex: number, onCell: (cell: T.Cell) => void, name: string) {
    const input = table.inputs[inputIndex]
    const property = input ? propertyOf(input, vocabulary) : undefined
    const set = property?.valueType.type === "choice" ? property.valueType.set : null
    return (
      <div className="flex flex-col gap-2">
        <ChoiceSelect
          label={`${name}: kind`}
          value={cell.type}
          choices={cellChoices}
          onChange={(kind) => (kind === cell.type ? undefined : onCell(newCell(kind)))}
        />
        {match(cell)
          .with({ type: "any" }, () => null)
          .with({ type: "in" }, { type: "not-in" }, (list) =>
            list.values.every((item) => item.type === "value") ? (
              <TermListPicker
                label={`${name}: values`}
                values={list.values.flatMap((item) => (item.type === "value" ? [item.term] : []))}
                options={termOptions(catalog, termFilters.valuesOf(set))}
                onChange={(keys) => onCell({ ...list, values: keys.map((term) => ({ type: "value", term })) })}
                placeholder="Add a value"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Calculated values; edit them as JSON.</p>
            )
          )
          .with({ type: "range" }, (range) => (
            <div className="flex flex-col gap-2">
              {(["min", "max"] as const).map((bound) => {
                const operand = range[bound]
                const boundName = `${name}: ${bound === "min" ? "lowest" : "highest"}`
                return operand ? (
                  <div key={bound} className="flex flex-wrap items-center gap-2">
                    <OperandEditor
                      label={boundName}
                      value={operand}
                      other={input}
                      onChange={(next) => onCell({ ...range, [bound]: next })}
                      catalog={catalog}
                      subject={subject}
                    />
                    <Button variant="ghost" size="sm" onClick={() => onCell({ ...range, [bound]: null })}>
                      No {bound === "min" ? "lowest" : "highest"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    key={bound}
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => onCell({ ...range, [bound]: { type: "number", value: 0 } })}
                  >
                    Set a {bound === "min" ? "lowest" : "highest"} value
                  </Button>
                )
              })}
            </div>
          ))
          .exhaustive()}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Inputs</legend>
        {table.inputs.map((input, index) => (
          // Inputs have no identity but their place; cells follow them by position.
          <div key={index} className="flex items-start gap-2">
            <OperandEditor
              label={`Input ${index + 1}`}
              value={input}
              onChange={(next) =>
                onChange({ ...table, inputs: table.inputs.map((item, i) => (i === index ? next : item)) })
              }
              catalog={catalog}
              subject={subject}
            />
            {table.inputs.length > 1 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove input ${index + 1}`}
                onClick={() => onChange(removeTableInput(table, index))}
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-fit" onClick={() => onChange(addTableInput(table))}>
          <PlusIcon />
          Add an input
        </Button>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Rows</legend>
        {table.rows.map((row, rowIndex) => (
          // Rows have no identity but their place.
          <div key={rowIndex} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Row {rowIndex + 1}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove row ${rowIndex + 1}`}
                disabled={table.rows.length === 1}
                onClick={() => onChange({ ...table, rows: table.rows.filter((_, i) => i !== rowIndex) })}
              >
                <Trash2Icon />
              </Button>
            </div>
            {row.when.map((cell, cellIndex) => (
              <div key={cellIndex} className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">When {inputName(cellIndex)}</span>
                {cellEditor(
                  cell,
                  cellIndex,
                  (next) =>
                    setRow(rowIndex, { ...row, when: row.when.map((item, i) => (i === cellIndex ? next : item)) }),
                  `Row ${rowIndex + 1}, ${inputName(cellIndex)}`
                )}
              </div>
            ))}
            <ChoiceSelect
              label={`Row ${rowIndex + 1}: result`}
              value={row.result}
              choices={resultChoices}
              onChange={(result) => setRow(rowIndex, { ...row, result })}
            />
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange({ ...table, rows: [...table.rows, newRow(table.inputs.length)] })}
        >
          <PlusIcon />
          Add a row
        </Button>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">When no row matches</span>
        <ChoiceSelect
          label="When no row matches"
          value={table.otherwise}
          choices={resultChoices}
          onChange={(otherwise) => onChange({ ...table, otherwise })}
        />
      </div>
    </div>
  )
}
