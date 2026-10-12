import { match } from "ts-pattern"
import type * as T from "@/schema/types"

// The condition shapes the structured editor handles (encoding.md, UX, Editing): compare, in, between, all and any.

export const editableConditionKinds = ["compare", "in", "between", "all", "any"] as const
export type EditableConditionKind = (typeof editableConditionKinds)[number]

export const conditionKindLabels: Record<EditableConditionKind, string> = {
  compare: "Compares a fact",
  in: "Is one of",
  between: "Is between",
  all: "All of these",
  any: "Any of these"
}

export function isEditableCondition(
  condition: T.Condition
): condition is Extract<T.Condition, { type: EditableConditionKind }> {
  return editableConditionKinds.some((kind) => kind === condition.type)
}

export const comparatorLabels: Record<T.Comparator, string> = {
  "=": "is",
  "!=": "isn't",
  "<": "is less than",
  "<=": "is at most",
  ">": "is more than",
  ">=": "is at least"
}

const emptyFact: T.Operand = { type: "ref", path: [] }

/** The left side a condition compares, kept when its kind changes. */
function leftOf(condition: T.Condition): T.Operand {
  return match(condition)
    .with({ type: "compare" }, { type: "in" }, { type: "between" }, ({ left }) => left)
    .otherwise(() => emptyFact)
}

/** A condition of another kind, keeping what it can of the one it replaces. */
export function convertCondition(condition: T.Condition, kind: EditableConditionKind): T.Condition {
  const left = leftOf(condition)
  return match(kind)
    .returnType<T.Condition>()
    .with("compare", () => ({ type: "compare", left, op: "=", right: { type: "number", value: 0 } }))
    .with("in", () => ({ type: "in", left, values: [] }))
    .with("between", () => ({
      type: "between",
      left,
      min: { type: "number", value: 0 },
      max: { type: "number", value: 0 },
      includeMin: true,
      includeMax: true
    }))
    .with("all", "any", (group) => ({
      type: group,
      of: condition.type === "all" || condition.type === "any" ? condition.of : [condition]
    }))
    .exhaustive()
}

/** A condition to start from when one is added. */
export const newCondition = (): T.Condition => convertCondition({ type: "all", of: [] }, "compare")
