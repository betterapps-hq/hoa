import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  documentRequirementIds,
  findAttribute,
  projectTypes,
  scopeLabels,
  type AttributeScope,
  type ProjectTypeId
} from "@/rules/catalog"
import { documentLabel } from "@/rules/catalog"
import type { AllowedValue, Check, Condition } from "@/rules/rule"

// Structured editing of what a rule checks and when it applies: the parts the review evaluates.

export const checkTypeLabels: Record<Check["type"], string> = {
  "allowed-values": "Must be one of a list",
  "allowed-values-by": "Allowed values depend on another detail",
  "prohibited-values": "Must not be one of a list",
  range: "Must be within a range",
  matches: "Must match another detail",
  "required-fact": "Must be stated in the application",
  "required-document": "Must include a document",
  qualitative: "Judged from the application",
  informational: "For information only"
}

const checkTypes = Object.keys(checkTypeLabels).filter((type): type is Check["type"] => type in checkTypeLabels)

/** A check of a type, reusing the attribute already chosen where the type has one. */
export function emptyCheck(type: Check["type"], attribute: string): Check {
  switch (type) {
    case "allowed-values":
      return { type, attribute, values: [], otherwise: "not-met" }
    case "allowed-values-by":
      return { type, keyAttribute: attribute, attribute, table: [], unknownKey: "committee" }
    case "prohibited-values":
      return { type, attribute, values: [] }
    case "range":
      return { type, attributes: [attribute], min: null, max: null }
    case "matches":
      return { type, attribute, otherAttribute: attribute }
    case "required-fact":
      return { type, attribute }
    case "required-document":
      return { type, document: "application-form", mustState: [] }
    case "qualitative":
      return { type, criterion: "" }
    case "informational":
      return { type }
  }
}

function mainAttribute(check: Check) {
  switch (check.type) {
    case "allowed-values":
    case "allowed-values-by":
    case "prohibited-values":
    case "matches":
    case "required-fact":
      return check.attribute
    case "range":
      return check.attributes[0] ?? ""
    default:
      return ""
  }
}

/** Splits "a, b, c" into trimmed, non-empty entries. */
export function splitList(text: string) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Values from a comma-separated list, keeping the aliases of values that were already there. */
export function valuesFromList(text: string, previous: readonly AllowedValue[]): AllowedValue[] {
  return splitList(text).map(
    (value) => previous.find((item) => item.value.toLowerCase() === value.toLowerCase()) ?? { value, aliases: [] }
  )
}

type AttributeSelectProps = {
  id: string
  label: string
  value: string
  projectType: ProjectTypeId
  /** Limits the choices, such as to numbers for a range. */
  kinds?: readonly ("number" | "text" | "enum" | "boolean")[]
  onChange: (key: string) => void
}

/** Picks an attribute by its readable name, grouped by what it belongs to. */
export function AttributeSelect({ id, label, value, projectType, kinds, onChange }: AttributeSelectProps) {
  const attributes = projectTypes[projectType].attributes.filter((item) => !kinds || kinds.includes(item.kind))
  const scopes = [...new Set(attributes.map((item) => item.scope))]
  const isUnknown = value !== "" && !findAttribute(value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {isUnknown ? <NativeSelectOption value={value}>{value} (not in the catalog)</NativeSelectOption> : null}
        {scopes.map((scope: AttributeScope) => (
          <NativeSelectOptGroup key={scope} label={scopeLabels[scope]}>
            {attributes
              .filter((item) => item.scope === scope)
              .map((item) => (
                <NativeSelectOption key={item.key} value={item.key}>
                  {scopeLabels[scope]}: {item.label}
                </NativeSelectOption>
              ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
    </Field>
  )
}

function ValuesField({
  id,
  label,
  values,
  onChange
}: {
  id: string
  label: string
  values: readonly AllowedValue[]
  onChange: (values: AllowedValue[]) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        defaultValue={values.map((item) => item.value).join(", ")}
        onBlur={(event) => onChange(valuesFromList(event.target.value, values))}
      />
      <FieldDescription>Separate values with commas.</FieldDescription>
    </Field>
  )
}

function FallbackSelect({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: "not-met" | "committee"
  onChange: (value: "not-met" | "committee") => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value === "committee" ? "committee" : "not-met")}
      >
        <NativeSelectOption value="not-met">The rule isn’t met</NativeSelectOption>
        <NativeSelectOption value="committee">The committee decides</NativeSelectOption>
      </NativeSelect>
    </Field>
  )
}

function numberOrNull(text: string) {
  const value = Number.parseFloat(text)
  return Number.isFinite(value) ? value : null
}

export type CheckEditorProps = {
  id: string
  value: Check
  projectType: ProjectTypeId
  onChange: (check: Check) => void
}

/** Edits what a rule checks as structure: the check type and its attributes, values, limits or document. */
export function CheckEditor({ id, value: check, projectType, onChange }: CheckEditorProps) {
  const field = (name: string) => `${id}-${name}`
  const unit = (key: string | undefined) => {
    const found = key ? findAttribute(key)?.unit : undefined
    return found ? ` (${found === "in" ? "inches" : "feet"})` : ""
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field>
        <FieldLabel htmlFor={field("type")}>What the rule checks</FieldLabel>
        <NativeSelect
          id={field("type")}
          value={check.type}
          onChange={(event) => {
            const type = checkTypes.find((item) => item === event.target.value)
            if (type && type !== check.type) {
              onChange(emptyCheck(type, mainAttribute(check)))
            }
          }}
        >
          {checkTypes.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {checkTypeLabels[type]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {check.type === "allowed-values" || check.type === "prohibited-values" ? (
        <>
          <AttributeSelect
            id={field("attribute")}
            label="Detail"
            value={check.attribute}
            projectType={projectType}
            onChange={(attribute) => onChange({ ...check, attribute })}
          />
          <ValuesField
            key={`${check.type}:${check.attribute}`}
            id={field("values")}
            label={check.type === "allowed-values" ? "Allowed values" : "Values not allowed"}
            values={check.values}
            onChange={(values) => onChange({ ...check, values })}
          />
          {check.type === "allowed-values" ? (
            <FallbackSelect
              id={field("otherwise")}
              label="When it’s something else"
              value={check.otherwise}
              onChange={(otherwise) => onChange({ ...check, otherwise })}
            />
          ) : null}
        </>
      ) : null}

      {check.type === "allowed-values-by" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <AttributeSelect
              id={field("attribute")}
              label="Detail"
              value={check.attribute}
              projectType={projectType}
              onChange={(attribute) => onChange({ ...check, attribute })}
            />
            <AttributeSelect
              id={field("key")}
              label="Depends on"
              value={check.keyAttribute}
              projectType={projectType}
              onChange={(keyAttribute) => onChange({ ...check, keyAttribute })}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Allowed values for each</legend>
            {check.table.map((row, index) => (
              <div key={`${index}:${row.key.value}`} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <Input
                  aria-label={`Row ${index + 1}: when`}
                  defaultValue={row.key.value}
                  onBlur={(event) =>
                    onChange({
                      ...check,
                      table: check.table.map((item, position) =>
                        position === index ? { ...item, key: { ...item.key, value: event.target.value.trim() } } : item
                      )
                    })
                  }
                />
                <Input
                  aria-label={`Row ${index + 1}: allowed values`}
                  defaultValue={row.values.map((item) => item.value).join(", ")}
                  onBlur={(event) =>
                    onChange({
                      ...check,
                      table: check.table.map((item, position) =>
                        position === index ? { ...item, values: valuesFromList(event.target.value, item.values) } : item
                      )
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => onChange({ ...check, table: check.table.filter((_, position) => position !== index) })}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() =>
                onChange({ ...check, table: [...check.table, { key: { value: "", aliases: [] }, values: [] }] })
              }
            >
              <PlusIcon />
              Add a row
            </Button>
          </fieldset>
          <FallbackSelect
            id={field("unknown")}
            label="When it isn’t listed"
            value={check.unknownKey}
            onChange={(unknownKey) => onChange({ ...check, unknownKey })}
          />
        </>
      ) : null}

      {check.type === "range" ? (
        <>
          <AttributeSelect
            id={field("attribute")}
            label="Number"
            value={check.attributes[0] ?? ""}
            projectType={projectType}
            kinds={["number"]}
            onChange={(attribute) => onChange({ ...check, attributes: [attribute, ...check.attributes.slice(1)] })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={field("min")}>At least{unit(check.attributes[0])}</FieldLabel>
              <Input
                id={field("min")}
                type="number"
                defaultValue={check.min ?? ""}
                onBlur={(event) => onChange({ ...check, min: numberOrNull(event.target.value) })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={field("max")}>At most{unit(check.attributes[0])}</FieldLabel>
              <Input
                id={field("max")}
                type="number"
                defaultValue={check.max ?? ""}
                onBlur={(event) => onChange({ ...check, max: numberOrNull(event.target.value) })}
              />
            </Field>
          </div>
        </>
      ) : null}

      {check.type === "matches" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <AttributeSelect
            id={field("attribute")}
            label="Detail"
            value={check.attribute}
            projectType={projectType}
            onChange={(attribute) => onChange({ ...check, attribute })}
          />
          <AttributeSelect
            id={field("other")}
            label="Must match"
            value={check.otherAttribute}
            projectType={projectType}
            onChange={(otherAttribute) => onChange({ ...check, otherAttribute })}
          />
        </div>
      ) : null}

      {check.type === "required-fact" ? (
        <AttributeSelect
          id={field("attribute")}
          label="Detail"
          value={check.attribute}
          projectType={projectType}
          onChange={(attribute) => onChange({ ...check, attribute })}
        />
      ) : null}

      {check.type === "required-document" ? (
        <>
          <Field>
            <FieldLabel htmlFor={field("document")}>Document</FieldLabel>
            <NativeSelect
              id={field("document")}
              value={check.document}
              onChange={(event) => {
                const document = documentRequirementIds.find((item) => item === event.target.value)
                if (document) {
                  onChange({ ...check, document })
                }
              }}
            >
              {documentRequirementIds.map((document) => (
                <NativeSelectOption key={document} value={document}>
                  {documentLabel(document)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={field("states")}>It must state</FieldLabel>
            <Textarea
              id={field("states")}
              defaultValue={check.mustState.join("\n")}
              onBlur={(event) =>
                onChange({
                  ...check,
                  mustState: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                })
              }
            />
            <FieldDescription>
              One statement per line. Leave empty when the document only has to be included.
            </FieldDescription>
          </Field>
        </>
      ) : null}

      {check.type === "qualitative" ? (
        <Field>
          <FieldLabel htmlFor={field("criterion")}>What to judge</FieldLabel>
          <Textarea
            id={field("criterion")}
            defaultValue={check.criterion}
            onBlur={(event) => onChange({ ...check, criterion: event.target.value.trim() })}
          />
          <FieldDescription>
            A model judges this from the application; the committee decides when it isn’t clearly met.
          </FieldDescription>
        </Field>
      ) : null}
    </div>
  )
}

const operatorLabels: Record<"equals" | "in" | "not-in" | "exists", string> = {
  equals: "is",
  in: "is one of",
  "not-in": "isn’t",
  exists: "is given"
}

/** A condition's value as the editor shows it. */
function conditionValueText(value: Extract<Condition, { type: "fact" }>["value"]) {
  if (value === null) {
    return ""
  }
  return Array.isArray(value) ? value.join(", ") : String(value)
}

/** A condition's value from the editor, typed by its attribute and operator. */
export function conditionValue(
  attributeKey: string,
  operator: "equals" | "in" | "not-in" | "exists",
  text: string
): Extract<Condition, { type: "fact" }>["value"] {
  if (operator === "exists") {
    return null
  }
  if (findAttribute(attributeKey)?.kind === "boolean") {
    return text.trim().toLowerCase() === "yes" || text.trim().toLowerCase() === "true"
  }
  return operator === "equals" ? text.trim() : splitList(text)
}

export type ConditionsEditorProps = {
  id: string
  value: readonly Condition[]
  projectType: ProjectTypeId
  /** The rule's id, for naming new text conditions. */
  ruleId: string
  onChange: (conditions: Condition[]) => void
}

/** Edits when a rule applies: conditions on details of the application, or described in words. */
export function ConditionsEditor({ id, value: conditions, projectType, ruleId, onChange }: ConditionsEditorProps) {
  const firstAttribute = projectTypes[projectType].attributes[0]?.key ?? ""
  const update = (index: number, condition: Condition) =>
    onChange(conditions.map((item, position) => (position === index ? condition : item)))
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Applies when</legend>
      {conditions.length === 0 ? <p className="text-sm text-muted-foreground">Always applies.</p> : null}
      {conditions.map((condition, index) =>
        condition.type === "text" ? (
          <div key={condition.id} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              aria-label={`Condition ${index + 1}`}
              defaultValue={condition.description}
              onBlur={(event) => update(index, { ...condition, description: event.target.value.trim() })}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => onChange(conditions.filter((_, position) => position !== index))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ) : (
          <div
            key={`${index}:${condition.attribute}`}
            className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]"
          >
            <AttributeSelect
              id={`${id}-${index}-attribute`}
              label={`Condition ${index + 1}`}
              value={condition.attribute}
              projectType={projectType}
              onChange={(attribute) => update(index, { ...condition, attribute })}
            />
            <NativeSelect
              aria-label={`Condition ${index + 1}: comparison`}
              value={condition.operator}
              onChange={(event) => {
                const operator = (["equals", "in", "not-in", "exists"] as const).find(
                  (item) => item === event.target.value
                )
                if (operator) {
                  update(index, {
                    ...condition,
                    operator,
                    value: conditionValue(condition.attribute, operator, conditionValueText(condition.value))
                  })
                }
              }}
            >
              {Object.entries(operatorLabels).map(([operator, label]) => (
                <NativeSelectOption key={operator} value={operator}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              aria-label={`Condition ${index + 1}: value`}
              disabled={condition.operator === "exists"}
              defaultValue={conditionValueText(condition.value)}
              onBlur={(event) =>
                update(index, {
                  ...condition,
                  value: conditionValue(condition.attribute, condition.operator, event.target.value)
                })
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => onChange(conditions.filter((_, position) => position !== index))}
            >
              <Trash2Icon />
            </Button>
          </div>
        )
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([...conditions, { type: "fact", attribute: firstAttribute, operator: "equals", value: "" }])
          }
        >
          <PlusIcon />
          Add a condition
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([
              ...conditions,
              { type: "text", id: `${ruleId}:c${crypto.randomUUID().slice(0, 8)}`, description: "" }
            ])
          }
        >
          Add one in words
        </Button>
      </div>
    </fieldset>
  )
}
