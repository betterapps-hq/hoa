import type * as T from "@/schema/types"
import { isA } from "./conditions"
import type { Context, Input } from "./context"

// Unsettled references (schema.md, Expressions 4): an uncertain or conflicting reference could be any thing in the
// request of the type it refers to. A rule whose outcome is the same whichever one it is has that outcome; one whose
// outcome depends on it stays unknown.

/** Settling more references than this many ways at once isn't tried; the finding stays as it was. */
const maxSettlements = 64

/** A single-valued reference read as uncertain or conflicting, and every thing it could point to. */
export type UnsettledReference = { fact: T.Fact; candidates: string[] }

/** The unsettled references among a finding's reads, each once. */
export function unsettledReferences(context: Context, reads: readonly Input[]): UnsettledReference[] {
  const seen = new Set<string>()
  const scratch: Context = { ...context, reads: [] }
  return reads.flatMap((read) => {
    const key = `${read.entity} ${read.property}`
    const property = context.vocabulary.property(read.property)
    const [fact] = context.facts(read.entity, read.property)
    const isUnsettled = read.state === "uncertain" || read.state === "conflicting"
    if (seen.has(key) || !isUnsettled || !fact || property?.valueType.type !== "reference" || property.many) {
      return []
    }
    seen.add(key)
    const { to } = property.valueType
    const candidates = context.request.entities
      .filter((entity) => entity.id !== read.entity && (to === null || isA(scratch, entity.id, to) !== false))
      .map((entity) => entity.id)
    return candidates.length > 0 ? [{ fact, candidates }] : []
  })
}

/** Every way of settling the references, each as the facts that state one candidate apiece; none past the limit. */
export function settlements(references: readonly UnsettledReference[]): T.Fact[][] {
  const count = references.reduce((product, reference) => product * reference.candidates.length, 1)
  if (references.length === 0 || count > maxSettlements) {
    return []
  }
  return references.reduce<T.Fact[][]>(
    (ways, { fact, candidates }) =>
      ways.flatMap((way) =>
        candidates.map((id): T.Fact[] => [
          ...way,
          { ...fact, state: "known", value: { type: "entity", entity: id }, candidates: [] }
        ])
      ),
    [[]]
  )
}

/** A fresh context for one finding that reads these facts in place of the ones they settle. */
export function settledContext(context: Context, facts: readonly T.Fact[]): Context {
  const byKey = new Map(facts.map((fact) => [`${fact.entity} ${fact.property}`, fact]))
  return {
    ...context,
    facts: (entity, property) => {
      const settled = byKey.get(`${entity} ${property}`)
      return settled ? [settled] : context.facts(entity, property)
    },
    reads: [],
    deriving: new Set()
  }
}
