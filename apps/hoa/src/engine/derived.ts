import { evaluateCondition } from "./conditions"
import type { Context, Resolved } from "./context"
import { evaluateOperand } from "./operands"
import * as V from "./values"
import type { PropertyTerm } from "./vocabulary"

// Derived properties (schema.md, Values, units and silence): the value of the first derivation whose when holds, and
// unknown if none does. A derivation whose when is unknown leaves the value unknown, since it might be the one.

const unstated: Resolved = { state: "unknown", isUnstated: true, partial: null }

export function deriveProperty(context: Context, entity: string, property: PropertyTerm): Resolved {
  const key = `${entity} ${property.key}`
  if (context.deriving.has(key)) {
    return unstated
  }
  context.deriving.add(key)
  try {
    const scope = { subject: { type: "entity" as const, id: entity } }
    for (const derivation of property.derived ?? []) {
      const applies = derivation.when ? evaluateCondition(context, scope, derivation.when) : true
      if (applies === false) {
        continue
      }
      if (applies === null) {
        return unstated
      }
      return toResolved(evaluateOperand(context, scope, derivation.value))
    }
    return unstated
  } finally {
    context.deriving.delete(key)
  }
}

// A computed range is known only when it's a single value; otherwise it's unknown, narrowed to the range.
function toResolved(evaluated: V.Evaluated): Resolved {
  if (evaluated.kind === "absent") {
    return { state: "absent" }
  }
  if (evaluated.kind === "unknown") {
    return unstated
  }
  const { value } = evaluated
  const isRange =
    (value.type === "number" || value.type === "date" || value.type === "instant") && !V.isPoint(value.range)
  return isRange ? { state: "unknown", isUnstated: true, partial: value } : { state: "known", value }
}
