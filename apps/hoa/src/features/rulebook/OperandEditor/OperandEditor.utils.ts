import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// The operands the structured editor handles, and what a property tells it about the other side of a comparison.

export const editableOperandKinds = ["ref", "quantity", "number", "value", "boolean", "date"] as const
export type EditableOperandKind = (typeof editableOperandKinds)[number]

export const operandKindLabels: Record<EditableOperandKind, string> = {
  ref: "A fact",
  quantity: "An amount",
  number: "A number",
  value: "A listed value",
  boolean: "Yes or no",
  date: "A date"
}

export function isEditableOperand(operand: T.Operand): operand is Extract<T.Operand, { type: EditableOperandKind }> {
  return editableOperandKinds.some((kind) => kind === operand.type)
}

/** The property a fact operand reads, when it reads one. */
export function propertyOf(operand: T.Operand, vocabulary: Vocabulary) {
  if (operand.type !== "ref") {
    return undefined
  }
  const term = vocabulary.get(operand.path.at(-1) ?? "")
  return term?.kind === "property" ? term : undefined
}

/** A new operand of a kind, suited to what the other side reads where it can be. */
export function defaultOperand(
  kind: EditableOperandKind,
  other: Extract<TermContent, { kind: "property" }> | undefined
) {
  const valueType = other?.valueType
  return match(kind)
    .returnType<T.Operand>()
    .with("ref", () => ({ type: "ref", path: [] }))
    .with("quantity", () => ({
      type: "quantity",
      value: 0,
      unit: valueType?.type === "quantity" ? valueType.unit : "inch"
    }))
    .with("number", () => ({ type: "number", value: 0 }))
    .with("value", () => ({ type: "value", term: "" }))
    .with("boolean", () => ({ type: "boolean", value: true }))
    .with("date", () => ({ type: "date", value: new Date().toISOString().slice(0, 10) }))
    .exhaustive()
}

/** "its fence run's height", for a path the single-property picker can't show. */
export function pathLabel(path: T.Path, vocabulary: Vocabulary) {
  const from = path.from ?? "subject"
  if (path.path.length === 0) {
    return from === "subject" ? "it" : `the ${from}`
  }
  const owner = from === "subject" ? "its" : `the ${from}'s`
  return `${owner} ${path.path.map((key) => vocabulary.label(key)).join("'s ")}`
}
