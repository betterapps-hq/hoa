import { match, P } from "ts-pattern"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"

// What a rule reads (implementation-plan.md, Evaluation round 1, check agreement): every path it follows from a root,
// with the constants it compares each with, and the approvals, documents, judgments and text conditions it waits on.
// The check-agreement scorer generates facts for these.

/** A path from a root; a path inside a quantifier is prefixed with the path to its items. */
export type Place = { from: T.Root; path: T.TermKey[] }

export type Probe =
  /** base: the place is a divisor, or a quantity a fraction is taken of, so a zero there has no meaningful answer. */
  | ({ kind: "fact"; constants: T.Operand[]; base?: boolean } & Place)
  | { kind: "approval"; parties: T.TermKey[] }
  | { kind: "document"; document: T.TermKey; signedBy: T.TermKey[] }
  | { kind: "judgment" }
  | { kind: "text"; text: string }

type Constant = Extract<T.Operand, { type: "quantity" | "fraction" | "number" | "value" | "boolean" | "date" | "time" }>

const isConstant = (operand: T.Operand): operand is Constant =>
  ["quantity", "fraction", "number", "value", "boolean", "date", "time"].includes(operand.type)

const subjectRoot: Place = { from: "subject", path: [] }

/** The places that are a share's base: a quotient's divisors, or what a product multiplies by a constant. */
function shareBases(type: string, of: readonly T.Operand[], places: readonly Place[][]) {
  if (type === "quotient") {
    return places.slice(1).flat()
  }
  return type === "product" && of.some(isConstant) ? places.flat() : []
}

/** A path as seen from the scope it's evaluated in: a subject path continues the scope's own path. */
const placeOf = (scope: Place, path: T.Path): Place =>
  path.from === undefined || path.from === "subject"
    ? { from: scope.from, path: [...scope.path, ...path.path] }
    : { from: path.from, path: path.path }

function probeCollector(vocabulary: Vocabulary) {
  const probes = new Map<string, Probe>()
  const add = (probe: Probe) => {
    const key = match(probe)
      .with({ kind: "fact" }, (fact) => placeKey(fact))
      .with({ kind: "document" }, (document) => `document ${document.document}`)
      .with({ kind: "text" }, (text) => `text ${text.text}`)
      .otherwise((other) => other.kind)
    const existing = probes.get(key)
    if (existing?.kind === "fact" && probe.kind === "fact") {
      existing.constants.push(...probe.constants)
    } else if (existing?.kind === "approval" && probe.kind === "approval") {
      existing.parties = [...new Set([...existing.parties, ...probe.parties])]
    } else if (!existing) {
      probes.set(key, probe)
    }
  }
  const fact = (place: Place, constants: T.Operand[] = []) => {
    if (place.path.length > 0) {
      add({ kind: "fact", ...place, constants: [...constants] })
    }
  }
  const seenCategories = new Set<T.TermKey>()
  /** Places that are a quotient's divisor or a product's factor beside a constant (the base of a share). */
  const bases = new Set<string>()
  const placeKey = (place: Place) => `fact ${place.from} ${place.path.join("/")}`

  /** The places an operand reads; constants compared with it are attached by the caller. */
  function operand(scope: Place, value: T.Operand): Place[] {
    return match(value)
      .returnType<Place[]>()
      .with({ type: "ref" }, (ref) => [placeOf(scope, ref)])
      .with({ type: P.union("sum", "greatest", "least", "difference", "product", "quotient") }, (arithmetic) => {
        const places = arithmetic.of.map((item) => operand(scope, item))
        shareBases(arithmetic.type, arithmetic.of, places).forEach((place) => bases.add(placeKey(place)))
        return places.flat()
      })
      .with({ type: "shift" }, (shift) => operand(scope, shift.of))
      .with({ type: "count" }, (count) => {
        const items = placeOf(scope, count)
        if (count.where) {
          condition(items, count.where)
        }
        return [items]
      })
      .with({ type: P.union("sum-of", "greatest-of", "least-of") }, (over) => {
        const items = placeOf(scope, over)
        if (over.where) {
          condition(items, over.where)
        }
        return [{ from: items.from, path: [...items.path, ...over.value] }]
      })
      .otherwise(() => [])
  }

  /** Reads both sides; each side's places get the other side's constants. */
  function compared(scope: Place, left: T.Operand, right: readonly T.Operand[]) {
    const constants = right.filter(isConstant)
    operand(scope, left).forEach((place) => fact(place, constants))
    right.forEach((item) => operand(scope, item).forEach((place) => fact(place, isConstant(left) ? [left] : [])))
  }

  function condition(scope: Place, value: T.Condition) {
    match(value)
      .with({ type: P.union("all", "any") }, ({ of }) => of.forEach((item) => condition(scope, item)))
      .with({ type: "not" }, ({ of }) => condition(scope, of))
      .with({ type: "compare" }, ({ left, right }) => compared(scope, left, [right]))
      .with({ type: "in" }, ({ left, values }) => compared(scope, left, values))
      .with({ type: "between" }, ({ left, min, max }) => compared(scope, left, [min, max]))
      .with({ type: "exists" }, (path) => fact(placeOf(scope, path)))
      .with({ type: "is-a" }, (isA) => {
        const place = placeOf(scope, isA)
        fact(place)
        const category = vocabulary.get(isA.category)
        if (category?.kind === "category" && !seenCategories.has(category.key)) {
          seenCategories.add(category.key)
          condition(place, category.criteria)
        }
      })
      .with({ type: "approved" }, (approved) => {
        fact(placeOf(scope, approved))
        add({ kind: "approval", parties: approved.by })
      })
      .with({ type: P.union("every", "some", "none") }, (quantifier) => {
        const items = placeOf(scope, quantifier)
        fact(items)
        if (quantifier.where) {
          condition(items, quantifier.where)
        }
        condition(items, quantifier.test)
      })
      .with({ type: "during" }, ({ start, end }) => {
        ;[...operand(scope, start), ...operand(scope, end)].forEach((place) => fact(place))
      })
      .with({ type: "text" }, ({ text }) => add({ kind: "text", text }))
      .exhaustive()
  }

  function check(value: T.Check) {
    match(value)
      .with({ type: "test" }, ({ test }) => condition(subjectRoot, test))
      .with({ type: "table" }, (table) =>
        table.inputs.forEach((input, i) => {
          const constants = table.rows.flatMap((row) =>
            match(row.when[i])
              .with({ type: P.union("in", "not-in") }, (cell) => cell.values.filter(isConstant))
              .with({ type: "range" }, (cell) =>
                [cell.min, cell.max].filter((item) => item !== null).filter(isConstant)
              )
              .otherwise(() => [])
          )
          operand(subjectRoot, input).forEach((place) => fact(place, constants))
        })
      )
      .with({ type: "document" }, (document) =>
        add({ kind: "document", document: document.document, signedBy: document.signedBy })
      )
      .with({ type: "deadline" }, (deadline) =>
        [...operand(subjectRoot, deadline.act), ...operand(subjectRoot, deadline.anchor)].forEach((place) =>
          fact(place)
        )
      )
      .with({ type: "judgment" }, () => add({ kind: "judgment" }))
      .with({ type: "approval" }, (approval) => add({ kind: "approval", parties: approval.by }))
      .exhaustive()
  }

  return {
    condition,
    check,
    probes: () =>
      [...probes.values()].map((probe) =>
        probe.kind === "fact" && bases.has(placeKey(probe)) ? { ...probe, base: true } : probe
      )
  }
}

/** Everything a rule's applicability and check read, merged by place. */
export function probesOf(rule: T.Rule, vocabulary: Vocabulary): Probe[] {
  const collector = probeCollector(vocabulary)
  if (rule.appliesWhen) {
    collector.condition(subjectRoot, rule.appliesWhen)
  }
  if (rule.kind === "norm" && rule.check) {
    collector.check(rule.check)
  }
  return collector.probes()
}
