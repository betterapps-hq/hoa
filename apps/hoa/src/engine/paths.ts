import type * as T from "@/schema/types"
import { type Context, type Item, type Resolved, type Scope, valueOfFact } from "./context"
import type { PropertyTerm } from "./vocabulary"

// Paths (schema.md, Expressions 1, 2, 5 and 6): from a root through properties, and through references to the things
// they name, to facts. A missing fact is unknown, or absent when the property says silence means none.

const unknownStep: Resolved = { state: "unknown", isUnstated: false, partial: null }

function rootItem(context: Context, scope: Scope, path: T.Path): Item {
  const root = path.from ?? "subject"
  return root === "subject" ? scope.subject : { type: "entity", id: context.rootId(root) }
}

/** One property of one entity, recorded as an input of the finding being evaluated. */
export function readProperty(context: Context, entity: string, property: PropertyTerm): Resolved {
  if (property.derived) {
    context.reads.push({ entity, property: property.key, state: "derived" })
    return context.derive(context, entity, property)
  }
  const [fact] = context.facts(entity, property.key)
  if (!fact) {
    const state = property.ifUnstated === "absent" ? "absent" : "unknown"
    context.reads.push({ entity, property: property.key, state })
    return state === "absent" ? { state } : { state, isUnstated: true, partial: null }
  }
  context.reads.push({ entity, property: property.key, state: fact.state })
  if (fact.state === "absent") {
    return { state: "absent" }
  }
  const value = fact.state === "known" && fact.value ? valueOfFact(context, fact.value) : undefined
  return value ? { state: "known", value } : unknownStep
}

// Follows every step but the last, which the caller reads as one value or as a list.
function walkToOwner(context: Context, scope: Scope, path: T.Path): { entity: string } | Resolved {
  let current = rootItem(context, scope, path)
  for (const key of path.path.slice(0, -1)) {
    const property = context.vocabulary.property(key)
    if (current.type !== "entity" || !property || property.many) {
      return unknownStep
    }
    const resolved = readProperty(context, current.id, property)
    if (resolved.state !== "known") {
      return resolved
    }
    if (resolved.value.type !== "entity") {
      return unknownStep
    }
    current = resolved.value
  }
  return current.type === "entity" ? { entity: current.id } : unknownStep
}

/** The single value a path reaches; a path with no steps is its root. */
export function resolvePath(context: Context, scope: Scope, path: T.Path): Resolved {
  const last = path.path.at(-1)
  if (last === undefined) {
    const item = rootItem(context, scope, path)
    return { state: "known", value: item.type === "entity" ? item : item.value }
  }
  const owner = walkToOwner(context, scope, path)
  if (!("entity" in owner)) {
    return owner
  }
  const property = context.vocabulary.property(last)
  if (!property || property.many) {
    return unknownStep
  }
  return readProperty(context, owner.entity, property)
}

/** The items of a many-valued path, and whether the list is the whole list. */
export type Items = { items: Item[]; unclear: number; isComplete: boolean }

export function resolveItems(context: Context, scope: Scope, path: T.Path): Items | null {
  const last = path.path.at(-1)
  const owner = walkToOwner(context, scope, path)
  if (!("entity" in owner)) {
    return owner.state === "absent" ? { items: [], unclear: 0, isComplete: true } : null
  }
  const property = last === undefined ? undefined : context.vocabulary.property(last)
  if (!property) {
    return null
  }
  const facts = context.facts(owner.entity, property.key)
  if (facts.length === 0) {
    const isAbsent = property.ifUnstated === "absent"
    context.reads.push({ entity: owner.entity, property: property.key, state: isAbsent ? "absent" : "unknown" })
    return { items: [], unclear: 0, isComplete: isAbsent }
  }
  const items: Item[] = []
  let unclear = 0
  for (const fact of facts) {
    context.reads.push({ entity: owner.entity, property: property.key, state: fact.state })
    const value = fact.state === "known" && fact.value ? valueOfFact(context, fact.value) : undefined
    if (value) {
      items.push(value.type === "entity" ? value : { type: "value", value })
    } else if (fact.state !== "absent") {
      unclear += 1
    }
  }
  const isComplete = facts.some((fact) => fact.complete === true || fact.state === "absent")
  return { items, unclear, isComplete }
}
