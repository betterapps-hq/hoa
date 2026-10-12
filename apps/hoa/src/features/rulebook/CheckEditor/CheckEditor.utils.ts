import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import { newCondition } from "../ConditionEditor/ConditionEditor.utils"

// The checks the structured editor handles (encoding.md, UX, Editing): a test, a table, a document, an approval and a
// judgment. Deadlines are edited as JSON.

export const editableCheckKinds = ["test", "table", "document", "approval", "judgment"] as const
export type EditableCheckKind = (typeof editableCheckKinds)[number]

export const checkKindLabels: Record<EditableCheckKind, string> = {
  test: "A condition",
  table: "A table of allowed combinations",
  document: "A document",
  approval: "An approval",
  judgment: "A judgment"
}

export function isEditableCheck(check: T.Check): check is Extract<T.Check, { type: EditableCheckKind }> {
  return editableCheckKinds.some((kind) => kind === check.type)
}

export const cellKinds = ["any", "in", "not-in", "range"] as const
export type CellKind = (typeof cellKinds)[number]

export const cellKindLabels: Record<CellKind, string> = {
  any: "Anything",
  in: "Is one of",
  "not-in": "Isn't one of",
  range: "Is in a range"
}

export function newCell(kind: CellKind): T.Cell {
  return match(kind)
    .returnType<T.Cell>()
    .with("any", () => ({ type: "any" }))
    .with("in", "not-in", (type) => ({ type, values: [] }))
    .with("range", () => ({ type: "range", min: null, max: null, includeMin: true, includeMax: true }))
    .exhaustive()
}

type TableCheck = Extract<T.Check, { type: "table" }>

export const newRow = (inputs: number): TableCheck["rows"][number] => ({
  when: Array.from({ length: Math.max(inputs, 1) }, () => newCell("any")),
  result: "met",
  citation: null
})

/** A new check of a kind; a test keeps nothing of the one it replaces. */
export function newCheck(kind: EditableCheckKind): T.Check {
  return match(kind)
    .returnType<T.Check>()
    .with("test", () => ({ type: "test", test: newCondition() }))
    .with("table", () => ({
      type: "table",
      inputs: [{ type: "ref", path: [] }],
      rows: [newRow(1)],
      otherwise: "not-met"
    }))
    .with("document", () => ({ type: "document", document: "", per: "request", mustState: [], signedBy: [] }))
    .with("approval", () => ({ type: "approval", by: [], needs: "all", prior: true, written: true }))
    .with("judgment", () => ({ type: "judgment", question: "", evidence: [] }))
    .exhaustive()
}

/** Adds an input to a table, with an "anything" cell in every row; removes one with its cells. */
export function addTableInput(table: TableCheck): TableCheck {
  return {
    ...table,
    inputs: [...table.inputs, { type: "ref", path: [] }],
    rows: table.rows.map((row) => ({ ...row, when: [...row.when, newCell("any")] }))
  }
}

export function removeTableInput(table: TableCheck, index: number): TableCheck {
  return {
    ...table,
    inputs: table.inputs.filter((_, i) => i !== index),
    rows: table.rows.map((row) => ({ ...row, when: row.when.filter((_, i) => i !== index) }))
  }
}
