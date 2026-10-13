import { match, P } from "ts-pattern"
import { coreTerms } from "./coreTerms"
import { parseStatement } from "./statement"
import type * as T from "./types"
import { createVocabulary } from "./vocabulary"
import type { QuestionContent, RuleContent, TermContent } from "./zod"

// Checks a rulebook across its records: references resolve, the rule invariants hold, expressions type-check and every
// provision is covered (schema.md, Invariants; encoding.md, Merge). The Zod schemas have already checked each record's
// shape and what it can check alone. The build runs it on parsed drafts, the editor on edited records, and a rules file
// is a rulebook as it stands.

export type JsonPath = (string | number)[]

/** A problem with one record: its key (a question's id, or its position) and the JSON path within it. */
export type RulebookIssue = { code: T.IssueCode; message: string; recordKey: string; path: JsonPath }

export type Rulebook = {
  organization: { id: T.Id }
  documents: Pick<T.GoverningDocument, "key" | "kind" | "issuedBy" | "governs">[]
  provisions: (Pick<T.Provision, "key" | "label"> & { noRule: Pick<T.NoRule, "reason"> | null })[]
  terms: TermContent[]
  proposedCore: TermContent[]
  rules: RuleContent[]
  settings: { clauses: Partial<T.Settings["clauses"]> }
  questions: (QuestionContent & { id?: T.Id })[]
}

type Site = { report: (code: T.IssueCode, message: string, path: JsonPath) => void }
type Things = T.TermKey[] | "any"
/** What paths start from (the subject is a thing, or an item of a list), and whether a text condition is allowed. */
type Scope = { subject: Type; request: Things; isApplicability: boolean }
type Type =
  | { type: "number" | "boolean" | "date" | "time" | "schedule" | "text" | "unknown" }
  | { type: "quantity"; dimension: T.Dimension }
  | { type: "choice"; set: T.TermKey }
  | { type: "thing" | "party"; things: Things }

const unknownType: Type = { type: "unknown" }
const timeDimensions = new Set<T.Dimension>(["elapsed-time", "calendar-period", "business-time"])
const applicants = new Set(["owner", "applicant"])

export function validateRulebook(rulebook: Rulebook): RulebookIssue[] {
  const issues: RulebookIssue[] = []
  const site = (recordKey: string): Site => ({
    report: (code, message, path) => issues.push({ code, message, recordKey, path })
  })
  const vocabulary = createVocabulary([...rulebook.proposedCore, ...rulebook.terms])
  const cited = new Set<string>()

  function index<R extends { key: string }>(records: R[], what: string) {
    const byKey = new Map<string, R>()
    for (const record of records) {
      if (byKey.has(record.key)) {
        site(record.key).report("duplicate-key", `another ${what} has the key ${record.key}`, ["key"])
      } else {
        byKey.set(record.key, record)
      }
    }
    return byKey
  }
  const documents = index(rulebook.documents, "document")
  const provisions = index(rulebook.provisions, "provision")
  const rules = index(rulebook.rules, "rule")
  const organizationTerms = index(rulebook.terms, "term")
  index(rulebook.proposedCore, "proposed core term")
  const coreKeys = new Set(coreTerms.map((term) => term.key))
  for (const term of rulebook.proposedCore) {
    if (coreKeys.has(term.key) || organizationTerms.has(term.key)) {
      site(term.key).report("duplicate-key", `${term.key} is already a core or organization term`, ["key"])
    }
  }

  // ─── References ─────────────────────────────────────────────────────────────────────────────────

  function term(at: Site, key: T.TermKey, path: JsonPath) {
    const found = vocabulary.get(key)
    if (!found) {
      at.report("undefined-term", `${key} isn't a term`, path)
    }
    return found
  }

  function expectTerm(at: Site, key: T.TermKey, path: JsonPath, is: (t: TermContent) => boolean, what: string) {
    const found = term(at, key, path)
    if (found && !is(found)) {
      at.report("type-mismatch", `${key} isn't ${what}`, path)
    }
    return found
  }

  const { thingOf, isParty } = vocabulary
  const isThingOrCategory = (t: TermContent) => t.kind === "thing" || t.kind === "category"
  const flowOf = (requestType: T.TermKey) => vocabulary.requestOf(requestType)?.flow ?? null
  const party = (at: Site, key: T.TermKey, path: JsonPath) =>
    expectTerm(at, key, path, (t) => isParty(t.key), "a party (a thing of nature party, or a category of one)")
  const requestType = (at: Site, key: T.TermKey, path: JsonPath) =>
    expectTerm(at, key, path, (t) => t.kind === "thing" && t.request !== null, "a request type")
  const timeUnit = (at: Site, key: T.TermKey, path: JsonPath) =>
    expectTerm(at, key, path, (t) => t.kind === "unit" && timeDimensions.has(t.dimension), "a unit of time")

  function citation(at: Site, value: T.Citation, path: JsonPath) {
    cited.add(value.provisionKey)
    if (!provisions.has(value.provisionKey)) {
      at.report("citation-not-found", `cites ${value.provisionKey}, which isn't a provision`, [...path, "provisionKey"])
    }
  }
  const citations = (at: Site, values: T.Citation[], path: JsonPath) =>
    values.forEach((value, i) => citation(at, value, [...path, i]))

  function document(at: Site, key: string, path: JsonPath) {
    if (!documents.has(key)) {
      at.report("undefined-document", `${key} isn't a governing document`, path)
    }
  }

  function ruleReference(at: Site, key: T.RuleKey, path: JsonPath) {
    const found = rules.get(key)
    if (!found) {
      at.report("undefined-rule", `${key} isn't a rule`, path)
    }
    return found
  }

  function sanctionReferences(at: Site, keys: T.RuleKey[], path: JsonPath) {
    keys.forEach((key, i) => {
      const target = ruleReference(at, key, [...path, i])
      if (target && target.kind !== "sanction") {
        at.report("invariant", `${key} isn't a sanction rule`, [...path, i])
      }
    })
  }

  function selection(at: Site, scope: Scope, value: T.RuleSelection, path: JsonPath, onlySanctions = false) {
    if (Array.isArray(value)) {
      if (onlySanctions) {
        sanctionReferences(at, value, path)
      } else {
        value.forEach((key, i) => ruleReference(at, key, [...path, i]))
      }
      return
    }
    value.documents.forEach((key, i) => document(at, key, [...path, "documents", i]))
    value.provisions.forEach((key, i) => {
      if (!provisions.has(key)) {
        at.report("citation-not-found", `selects ${key}, which isn't a provision`, [...path, "provisions", i])
      }
    })
    if (value.adoptedAfter) {
      expectDate(at, walk(at, scope, value.adoptedAfter, [...path, "adoptedAfter"], false), [...path, "adoptedAfter"])
    }
    if (onlySanctions) {
      sanctionReferences(at, value.except, [...path, "except"])
    } else {
      value.except.forEach((key, i) => ruleReference(at, key, [...path, "except", i]))
    }
  }

  // ─── Types (schema.md, Expressions 1 and 7) ──────────────────────────────────────────────────────

  function describe(type: Type): string {
    return match(type)
      .with({ type: "number" }, () => "a number")
      .with({ type: "boolean" }, () => "true or false")
      .with({ type: "date" }, () => "a date")
      .with({ type: "time" }, () => "a time of day")
      .with({ type: "schedule" }, () => "a schedule")
      .with({ type: "text" }, () => "text")
      .with({ type: "unknown" }, () => "an unknown type")
      .with({ type: "quantity" }, ({ dimension }) => `a quantity of ${dimension}`)
      .with({ type: "choice" }, ({ set }) => `a value of ${set}`)
      .with({ type: "thing" }, ({ things }) => (things === "any" ? "a thing" : things.join(" or ")))
      .with({ type: "party" }, () => "a party")
      .exhaustive()
  }

  function typeOfProperty(property: Extract<TermContent, { kind: "property" }>): Type {
    return match(property.valueType)
      .returnType<Type>()
      .with({ type: "quantity" }, ({ unit }) => quantityIn(unit))
      .with({ type: "count" }, () => ({ type: "number" }))
      .with({ type: "boolean" }, () => ({ type: "boolean" }))
      .with({ type: "choice" }, ({ set }) => ({ type: "choice", set }))
      .with({ type: P.union("date", "date-time") }, () => ({ type: "date" }))
      .with({ type: "time-of-day" }, () => ({ type: "time" }))
      .with({ type: "schedule" }, () => ({ type: "schedule" }))
      .with({ type: "text" }, () => ({ type: "text" }))
      .with({ type: "reference" }, ({ to }) => ({ type: "thing", things: to === null ? "any" : [to] }))
      .with({ type: "party" }, ({ among }) => ({ type: "party", things: among ?? "any" }))
      .exhaustive()
  }

  function quantityIn(unit: T.TermKey): Type {
    const found = vocabulary.get(unit)
    return found?.kind === "unit" ? { type: "quantity", dimension: found.dimension } : unknownType
  }

  const isNumeric = (type: Type) => type.type === "number" || type.type === "quantity"

  // Numbers match numbers, quantities match quantities of the same dimension, and a ratio matches a number.
  function numericMatch(a: Type, b: Type) {
    if (a.type === "quantity" && b.type === "quantity") {
      return a.dimension === b.dimension
    }
    if (a.type === "quantity") {
      return b.type === "number" && a.dimension === "ratio"
    }
    if (b.type === "quantity") {
      return a.type === "number" && b.dimension === "ratio"
    }
    return a.type === "number" && b.type === "number"
  }

  function equatable(a: Type, b: Type) {
    if (isNumeric(a) || isNumeric(b)) {
      return numericMatch(a, b)
    }
    const entity = new Set(["thing", "party"])
    if (entity.has(a.type) && entity.has(b.type)) {
      return true
    }
    return a.type === b.type && a.type !== "text" && a.type !== "schedule"
  }

  function orderable(a: Type, b: Type) {
    return (isNumeric(a) && numericMatch(a, b)) || (a.type === b.type && (a.type === "date" || a.type === "time"))
  }

  // Values belong to their property's set; a value from another complete set is invalid.
  function sameSet(at: Site, a: Type, b: Type, path: JsonPath) {
    if (a.type !== "choice" || b.type !== "choice" || a.set === b.set) {
      return
    }
    const complete = [a.set, b.set].filter((set) => {
      const found = vocabulary.get(set)
      return found?.kind === "value-set" && found.complete
    })
    at.report(
      complete.length > 0 ? "invalid-value" : "type-mismatch",
      `compares a value of ${a.set} with a value of ${b.set}`,
      path
    )
  }

  function compare(at: Site, a: Type, op: T.Comparator, b: Type, path: JsonPath) {
    if (a.type === "unknown" || b.type === "unknown") {
      return
    }
    const isEquality = op === "=" || op === "!="
    if (isEquality ? !equatable(a, b) : !orderable(a, b)) {
      at.report("type-mismatch", `can't compare ${describe(a)} with ${describe(b)} using ${op}`, path)
      return
    }
    sameSet(at, a, b, path)
  }

  function expectDate(at: Site, type: Type, path: JsonPath, allowSchedule = false) {
    const allowed = type.type === "unknown" || type.type === "date" || (allowSchedule && type.type === "schedule")
    if (!allowed) {
      at.report(
        "type-mismatch",
        `needs ${allowSchedule ? "a date or a schedule" : "a date"}, not ${describe(type)}`,
        path
      )
    }
  }

  // Follows a path from its root (schema.md, Expressions 1): each step is a property of the thing before it.
  function walk(at: Site, scope: Scope, value: T.Path, path: JsonPath, allowMany: boolean): Type {
    let current: Type = match(value.from ?? "subject")
      .returnType<Type>()
      .with("subject", () => scope.subject)
      .with("request", () => ({ type: "thing", things: scope.request }))
      .with(P.union("lot", "community"), (root) => ({ type: "thing", things: [root] }))
      .exhaustive()
    for (const [i, key] of value.path.entries()) {
      const stepPath = [...path, "path", i]
      if (current.type !== "thing" && current.type !== "party") {
        at.report("type-mismatch", `${key} follows ${describe(current)}, which has no properties`, stepPath)
        return unknownType
      }
      const property = term(at, key, stepPath)
      if (!property) {
        return unknownType
      }
      if (property.kind !== "property") {
        at.report("type-mismatch", `${key} isn't a property`, stepPath)
        return unknownType
      }
      const { things } = current
      const isKnown = things !== "any" && things.every((thing) => vocabulary.get(thing))
      if (isKnown && !things.some((thing) => thingOf(thing) === thingOf(property.of))) {
        at.report("type-mismatch", `${key} isn't a property of ${things.join(" or ")}`, stepPath)
      }
      if (property.many && !allowMany) {
        at.report(
          "type-mismatch",
          `${key} has many values, so it can only be counted, aggregated or quantified`,
          stepPath
        )
      }
      current = typeOfProperty(property)
    }
    return current
  }

  const itemsOf = (type: Type): Things => (type.type === "thing" || type.type === "party" ? type.things : "any")
  const thing = (things: Things): Type => ({ type: "thing", things })

  function sameKind(at: Site, types: Type[], path: JsonPath, allowDates: boolean): Type {
    if (types.some((type) => type.type === "unknown")) {
      return unknownType
    }
    if (allowDates && types.every((type) => type.type === "date")) {
      return { type: "date" }
    }
    const [first] = types
    if (!first || !types.every((type) => numericMatch(first, type))) {
      at.report(
        "type-mismatch",
        `needs numbers or quantities of one dimension: ${types.map(describe).join(", ")}`,
        path
      )
      return unknownType
    }
    return types.find((type) => type.type === "quantity") ?? first
  }

  function operand(at: Site, scope: Scope, value: T.Operand, path: JsonPath): Type {
    return match(value)
      .returnType<Type>()
      .with({ type: "ref" }, (ref) => walk(at, scope, ref, path, false))
      .with({ type: "quantity" }, ({ unit }) => {
        const found = expectTerm(at, unit, [...path, "unit"], (t) => t.kind === "unit", "a unit")
        return found?.kind === "unit" ? { type: "quantity", dimension: found.dimension } : unknownType
      })
      .with({ type: P.union("number", "fraction") }, () => ({ type: "number" }))
      .with({ type: "value" }, ({ term: key }) => {
        const found = term(at, key, [...path, "term"])
        if (!found) {
          return unknownType
        }
        if (found.kind === "value") {
          return { type: "choice", set: found.set }
        }
        if (isParty(key)) {
          return { type: "party", things: [key] }
        }
        at.report("type-mismatch", `${key} isn't a value or a party`, [...path, "term"])
        return unknownType
      })
      .with({ type: "boolean" }, () => ({ type: "boolean" }))
      .with({ type: P.union("date", "governing-date") }, () => ({ type: "date" }))
      .with({ type: "time" }, () => ({ type: "time" }))
      .with({ type: P.union("sum", "greatest", "least") }, (sum) =>
        sameKind(
          at,
          sum.of.map((item, i) => operand(at, scope, item, [...path, "of", i])),
          path,
          sum.type !== "sum"
        )
      )
      .with({ type: P.union("difference", "product", "quotient") }, (arithmetic) => {
        const [a, b] = arithmetic.of.map((item, i) => operand(at, scope, item, [...path, "of", i]))
        if (!a || !b || a.type === "unknown" || b.type === "unknown") {
          return unknownType
        }
        return arithmeticType(at, arithmetic.type, a, b, path)
      })
      .with({ type: "count" }, (count) => {
        const items = walk(at, scope, count, path, true)
        if (count.where) {
          condition(at, { ...scope, subject: items }, count.where, [...path, "where"])
        }
        return { type: "number" }
      })
      .with({ type: P.union("sum-of", "greatest-of", "least-of") }, (aggregate) => {
        const itemScope = { ...scope, subject: walk(at, scope, aggregate, path, true) }
        if (aggregate.where) {
          condition(at, itemScope, aggregate.where, [...path, "where"])
        }
        const of = walk(at, itemScope, { path: aggregate.value }, [...path, "value"], false)
        return sameKind(at, [of], [...path, "value"], aggregate.type !== "sum-of")
      })
      .with({ type: "shift" }, (shift) => {
        expectDate(at, operand(at, scope, shift.of, [...path, "of"]), [...path, "of"])
        timeUnit(at, shift.by.unit, [...path, "by", "unit"])
        return { type: "date" }
      })
      .exhaustive()
  }

  function arithmeticType(at: Site, op: "difference" | "product" | "quotient", a: Type, b: Type, path: JsonPath) {
    const mismatch = () => {
      at.report("type-mismatch", `can't take the ${op} of ${describe(a)} and ${describe(b)}`, path)
      return unknownType
    }
    if (!isNumeric(a) || !isNumeric(b)) {
      return mismatch()
    }
    return match(op)
      .returnType<Type>()
      .with("difference", () => {
        if (!numericMatch(a, b)) {
          return mismatch()
        }
        return a.type === "quantity" ? a : b
      })
      .with("product", () => {
        if (a.type === "number") {
          return b
        }
        return b.type === "number" ? a : mismatch()
      })
      .with("quotient", () => {
        if (a.type === "quantity" && b.type === "quantity") {
          return a.dimension === b.dimension ? { type: "number" } : mismatch()
        }
        return b.type === "number" ? a : mismatch()
      })
      .exhaustive()
  }

  function condition(at: Site, scope: Scope, value: T.Condition, path: JsonPath): void {
    match(value)
      .with({ type: P.union("all", "any") }, ({ of }) =>
        of.forEach((item, i) => condition(at, scope, item, [...path, "of", i]))
      )
      .with({ type: "not" }, ({ of }) => condition(at, scope, of, [...path, "of"]))
      .with({ type: "compare" }, ({ left, op, right }) =>
        compare(
          at,
          operand(at, scope, left, [...path, "left"]),
          op,
          operand(at, scope, right, [...path, "right"]),
          path
        )
      )
      .with({ type: "in" }, ({ left, values }) => {
        const leftType = operand(at, scope, left, [...path, "left"])
        values.forEach((item, i) =>
          compare(at, leftType, "=", operand(at, scope, item, [...path, "values", i]), [...path, "values", i])
        )
      })
      .with({ type: "between" }, (between) => {
        const leftType = operand(at, scope, between.left, [...path, "left"])
        compare(at, leftType, ">=", operand(at, scope, between.min, [...path, "min"]), [...path, "min"])
        compare(at, leftType, "<=", operand(at, scope, between.max, [...path, "max"]), [...path, "max"])
      })
      .with({ type: "exists" }, (exists) => walk(at, scope, exists, path, true))
      .with({ type: "is-a" }, (isA) => {
        const category = expectTerm(at, isA.category, [...path, "category"], (t) => t.kind === "category", "a category")
        const things = itemsOf(walk(at, scope, isA, path, false))
        if (category?.kind === "category" && things !== "any") {
          if (!things.some((thing) => thingOf(thing) === thingOf(category.of))) {
            at.report("type-mismatch", `${isA.category} is a kind of ${category.of}, not ${things.join(" or ")}`, path)
          }
        }
      })
      .with({ type: "approved" }, (approved) => {
        approved.by.forEach((key, i) => party(at, key, [...path, "by", i]))
        walk(at, scope, approved, path, false)
      })
      .with({ type: P.union("every", "some", "none") }, (quantifier) => {
        const itemScope = { ...scope, subject: walk(at, scope, quantifier, path, true) }
        if (quantifier.where) {
          condition(at, itemScope, quantifier.where, [...path, "where"])
        }
        condition(at, itemScope, quantifier.test, [...path, "test"])
      })
      .with({ type: "during" }, (during) => {
        expectDate(at, operand(at, scope, during.start, [...path, "start"]), [...path, "start"])
        expectDate(at, operand(at, scope, during.end, [...path, "end"]), [...path, "end"])
        timeWindow(at, scope, during.window, [...path, "window"])
      })
      .with({ type: "text" }, () => {
        if (!scope.isApplicability) {
          at.report("invariant", "a text condition is allowed only in applicability", path)
        }
      })
      .exhaustive()
  }

  function timeWindow(at: Site, scope: Scope, window: T.TimeWindow, path: JsonPath) {
    if (window.type !== "recurring") {
      return
    }
    const schedule = operand(at, scope, window.schedule, [...path, "schedule"])
    if (schedule.type !== "schedule" && schedule.type !== "unknown") {
      at.report("type-mismatch", `a recurring window needs a schedule, not ${describe(schedule)}`, [
        ...path,
        "schedule"
      ])
    }
    for (const bound of ["from", "to"] as const) {
      const offset = window[bound]
      if (offset) {
        timeUnit(at, offset.unit, [...path, bound, "unit"])
      }
    }
  }

  function check(at: Site, scope: Scope, value: T.Check, path: JsonPath) {
    match(value)
      .with({ type: "test" }, ({ test }) => condition(at, scope, test, [...path, "test"]))
      .with({ type: "table" }, (table) => {
        const inputs = table.inputs.map((input, i) => operand(at, scope, input, [...path, "inputs", i]))
        table.rows.forEach((row, r) => {
          const rowPath = [...path, "rows", r]
          if (row.when.length !== inputs.length) {
            at.report("type-mismatch", `has ${row.when.length} cells for ${inputs.length} inputs`, [...rowPath, "when"])
          }
          row.when.forEach((cell, c) => tableCell(at, scope, cell, inputs[c] ?? unknownType, [...rowPath, "when", c]))
          if (row.citation) {
            citation(at, row.citation, [...rowPath, "citation"])
          }
        })
      })
      .with({ type: "document" }, (documentCheck) => {
        expectTerm(
          at,
          documentCheck.document,
          [...path, "document"],
          (t) => {
            const thing = vocabulary.get(thingOf(t.key))
            return thing?.kind === "thing" && thing.nature === "document"
          },
          "a document thing, or a category of one"
        )
        documentCheck.signedBy.forEach((key, i) => party(at, key, [...path, "signedBy", i]))
      })
      .with({ type: "deadline" }, (deadline) => {
        expectDate(at, operand(at, scope, deadline.act, [...path, "act"]), [...path, "act"])
        expectDate(at, operand(at, scope, deadline.anchor, [...path, "anchor"]), [...path, "anchor"], true)
        for (const bound of ["earliest", "latest"] as const) {
          const offset = deadline[bound]
          if (offset) {
            timeUnit(at, offset.unit, [...path, bound, "unit"])
          }
        }
        deadline.onMiss.forEach((effect, i) => {
          const effectPath = [...path, "onMiss", i]
          const target = walk(at, scope, effect.target, [...effectPath, "target"], false)
          compare(at, target, "=", operand(at, scope, effect.value, [...effectPath, "value"]), effectPath)
        })
      })
      .with({ type: "judgment" }, (judgment) =>
        judgment.evidence.forEach((key, i) => term(at, key, [...path, "evidence", i]))
      )
      .with({ type: "approval" }, (approval) => approval.by.forEach((key, i) => party(at, key, [...path, "by", i])))
      .exhaustive()
  }

  function tableCell(at: Site, scope: Scope, cell: T.Cell, input: Type, path: JsonPath) {
    match(cell)
      .with({ type: "any" }, () => undefined)
      .with({ type: P.union("in", "not-in") }, ({ values }) =>
        values.forEach((item, i) =>
          compare(at, input, "=", operand(at, scope, item, [...path, "values", i]), [...path, "values", i])
        )
      )
      .with({ type: "range" }, (range) => {
        for (const bound of ["min", "max"] as const) {
          const limit = range[bound]
          if (limit) {
            compare(at, input, "<=", operand(at, scope, limit, [...path, bound]), [...path, bound])
          }
        }
      })
      .exhaustive()
  }

  function cure(at: Site, scope: Scope, value: T.Cure, path: JsonPath) {
    timeUnit(at, value.unit, [...path, "unit"])
    expectDate(at, walk(at, scope, value.after, [...path, "after"], false), [...path, "after"])
    if (value.curedBy) {
      expectDate(at, walk(at, scope, value.curedBy, [...path, "curedBy"], false), [...path, "curedBy"])
    }
  }

  function statement(at: Site, text: string) {
    for (const part of parseStatement(text)) {
      if (part.type === "term") {
        term(at, part.key, ["statement"])
      }
    }
  }

  // ─── Documents and provisions ────────────────────────────────────────────────────────────────────

  for (const governing of rulebook.documents) {
    const at = site(governing.key)
    if (governing.issuedBy) {
      party(at, governing.issuedBy, ["issuedBy"])
    }
    if (governing.governs) {
      condition(at, { subject: thing(["lot"]), request: "any", isApplicability: true }, governing.governs, ["governs"])
    }
  }

  for (const provision of rulebook.provisions) {
    const at = site(provision.key)
    const separator = provision.key.indexOf(":")
    const documentKey = provision.key.slice(0, separator)
    document(at, documentKey, ["key"])
    if (provision.key.slice(separator + 1) !== provision.label) {
      at.report("invalid-key", `the key's label part must be the provision's label, ${provision.label}`, ["key"])
    }
  }

  // ─── Terms ───────────────────────────────────────────────────────────────────────────────────────

  const coreByKey = new Map(coreTerms.map((core) => [core.key, core]))

  function termRecord(value: TermContent, organizationId: T.Id | null) {
    const at = site(value.key)
    if (value.organizationId !== organizationId) {
      at.report("invariant", `organizationId must be ${organizationId ?? "null"}`, ["organizationId"])
    }
    value.labels.forEach((label, i) => {
      if (label.citation) {
        citation(at, label.citation, ["labels", i, "citation"])
      }
    })
    citations(at, value.citations, ["citations"])
    const core = coreByKey.get(value.key)
    if (organizationId !== null && core) {
      const isSameType =
        core.kind === value.kind &&
        (core.kind !== "property" ||
          (value.kind === "property" && JSON.stringify(core.valueType) === JSON.stringify(value.valueType)))
      if (!isSameType) {
        at.report("type-mismatch", "a refinement of a core term keeps its kind and value type", ["kind"])
      } else if (
        core.kind === "unit" &&
        value.kind === "unit" &&
        (core.dimension !== value.dimension || core.perBase !== value.perBase)
      ) {
        at.report("type-mismatch", "a refinement of a core unit keeps its dimension and conversion", ["perBase"])
      }
    }
    match(value)
      .with({ kind: "thing" }, (request) => {
        if (request.request?.governingDate) {
          const date = walk(
            at,
            { subject: thing([request.key]), request: [request.key], isApplicability: false },
            { path: [request.request.governingDate] },
            ["request", "governingDate"],
            false
          )
          expectDate(at, date, ["request", "governingDate"])
        }
      })
      .with({ kind: "category" }, (category) => {
        expectTerm(at, category.of, ["of"], isThingOrCategory, "a thing or category")
        const scope: Scope = { subject: thing([category.of]), request: "any", isApplicability: true }
        condition(at, scope, category.criteria, ["criteria"])
      })
      .with({ kind: "property" }, (property) => {
        expectTerm(at, property.of, ["of"], isThingOrCategory, "a thing or category")
        if (!property.key.startsWith(`${property.of}.`)) {
          at.report("invalid-key", `a property's key starts with its thing's key, ${property.of}`, ["key"])
        }
        valueType(at, property.valueType)
        const scope: Scope = { subject: thing([property.of]), request: [property.of], isApplicability: false }
        property.derived?.forEach((derivation, i) => {
          if (derivation.when) {
            condition(at, scope, derivation.when, ["derived", i, "when"])
          }
          const derived = operand(at, scope, derivation.value, ["derived", i, "value"])
          compare(at, typeOfProperty(property), "=", derived, ["derived", i, "value"])
          citations(at, derivation.citations, ["derived", i, "citations"])
        })
      })
      .with({ kind: "value" }, (item) => {
        expectTerm(at, item.set, ["set"], (t) => t.kind === "value-set", "a value set")
        if (!item.key.startsWith(`${item.set}.`)) {
          at.report("invalid-key", `a value's key starts with its set's key, ${item.set}`, ["key"])
        }
        item.broader.forEach((key, i) => {
          const broader = expectTerm(at, key, ["broader", i], (t) => t.kind === "value", "a value")
          if (broader?.kind === "value" && broader.set !== item.set) {
            at.report("type-mismatch", `${key} is in another set`, ["broader", i])
          }
        })
      })
      .with({ kind: P.union("value-set", "unit") }, () => undefined)
      .exhaustive()
  }

  function valueType(at: Site, value: T.ValueType) {
    const path = ["valueType"]
    match(value)
      .with({ type: "quantity" }, ({ unit }) =>
        expectTerm(at, unit, [...path, "unit"], (t) => t.kind === "unit", "a unit")
      )
      .with({ type: "choice" }, ({ set }) =>
        expectTerm(at, set, [...path, "set"], (t) => t.kind === "value-set", "a value set")
      )
      .with({ type: "reference" }, ({ to }) => {
        if (to) {
          expectTerm(at, to, [...path, "to"], isThingOrCategory, "a thing or category")
        }
      })
      .with({ type: "party" }, ({ among }) => among?.forEach((key, i) => party(at, key, [...path, "among", i])))
      .otherwise(() => undefined)
  }

  rulebook.terms.forEach((value) => termRecord(value, rulebook.organization.id))
  rulebook.proposedCore.forEach((value) => termRecord(value, null))

  // ─── Rules ───────────────────────────────────────────────────────────────────────────────────────

  function ruleRecord(rule: RuleContent) {
    const at = site(rule.key)
    citations(at, rule.citations, ["citations"])
    const [main] = rule.citations
    if (main && !rule.key.startsWith(`${main.provisionKey}#`)) {
      at.report("invalid-key", `the key must start with its main citation, ${main.provisionKey}#`, ["key"])
    }
    statement(at, rule.statement)
    rule.requestTypes.forEach((key, i) => requestType(at, key, ["requestTypes", i]))
    if (rule.appliesTo) {
      expectTerm(at, rule.appliesTo, ["appliesTo"], isThingOrCategory, "a thing or category")
    }
    const scope: Scope = {
      subject: thing(rule.appliesTo ? [rule.appliesTo] : "any"),
      request: rule.requestTypes,
      isApplicability: false
    }
    if (rule.appliesWhen) {
      condition(at, { ...scope, isApplicability: true }, rule.appliesWhen, ["appliesWhen"])
    }
    if (rule.authority) {
      citation(at, rule.authority, ["authority"])
    }
    const mainDocument = main ? documents.get(main.provisionKey.slice(0, main.provisionKey.indexOf(":"))) : undefined
    if (mainDocument) {
      const isDecision = mainDocument.kind === "decision"
      if (isDecision && (rule.scope === null || rule.authority === null)) {
        at.report("invariant", "a decision rule has a scope and an authority", [rule.scope ? "authority" : "scope"])
      }
      if (!isDecision && (rule.scope !== null || rule.authority !== null)) {
        at.report("invariant", "only a decision rule has a scope or an authority", [rule.scope ? "scope" : "authority"])
      }
    }
    match(rule)
      .with({ kind: "norm" }, (norm) => normRecord(at, scope, norm))
      .with({ kind: "discretion" }, (discretion) => {
        party(at, discretion.decidedBy, ["decidedBy"])
        selection(at, scope, discretion.overrides, ["overrides"])
      })
      .with({ kind: "sanction" }, (sanction) => sanctionRecord(at, scope, sanction))
      .with({ kind: "limit" }, (limit) => {
        sanctionReferences(at, limit.limits, ["limits"])
        for (const bound of ["maxAmount", "maxTotal"] as const) {
          const value = limit[bound]
          if (value) {
            operand(at, scope, value, [bound])
          }
        }
      })
      .exhaustive()
  }

  function normRecord(at: Site, scope: Scope, norm: Extract<RuleContent, { kind: "norm" }>) {
    if (norm.bearer) {
      party(at, norm.bearer, ["bearer"])
    }
    if (norm.beneficiary) {
      term(at, norm.beneficiary, ["beneficiary"])
    }
    if (norm.decidedBy) {
      party(at, norm.decidedBy, ["decidedBy"])
    }
    selection(at, scope, norm.overrides, ["overrides"])
    if (norm.noExceptions) {
      citation(at, norm.noExceptions, ["noExceptions"])
    }
    if (norm.check) {
      check(at, scope, norm.check, ["check"])
    }
    // A remedy exactly when the rule runs in applications and binds the owner or applicant (schema.md, Invariants 7).
    const runsInApplications = norm.requestTypes.some((key) => flowOf(key) === "application")
    const isRemedied = norm.modality !== "permission" && norm.modality !== "requirement"
    const needsRemedy = runsInApplications && applicants.has(norm.bearer ?? "") && isRemedied
    if (needsRemedy && norm.remedy === null) {
      at.report("invariant", "runs in applications and binds the owner or applicant, so it needs a remedy", ["remedy"])
    }
    if (!needsRemedy && norm.remedy !== null) {
      at.report("invariant", "has a remedy, but doesn't run in applications binding the owner or applicant", ["remedy"])
    }
    if (norm.recurs) {
      const schedule = operand(at, scope, norm.recurs, ["recurs"])
      if (schedule.type !== "schedule" && schedule.type !== "unknown") {
        at.report("type-mismatch", `recurs needs a schedule, not ${describe(schedule)}`, ["recurs"])
      }
      if (!norm.requestTypes.some((key) => flowOf(key) === "duty")) {
        at.report("invariant", "a recurring rule runs in a request type whose flow is duty", ["requestTypes"])
      }
    }
    if (norm.cure && norm.cure !== "none") {
      cure(at, scope, norm.cure, ["cure"])
    }
  }

  function sanctionRecord(at: Site, scope: Scope, rule: Extract<RuleContent, { kind: "sanction" }>) {
    party(at, rule.imposedBy, ["imposedBy"])
    rule.against.forEach((key, i) => party(at, key, ["against", i]))
    rule.enforces.rules.forEach((key, i) => {
      const target = ruleReference(at, key, ["enforces", "rules", i])
      if (!target) {
        return
      }
      if (target.kind !== "norm" || (target.modality !== "obligation" && target.modality !== "prohibition")) {
        at.report("invariant", `enforces ${key}, which isn't an obligation or prohibition`, ["enforces", "rules", i])
      } else if (!target.requestTypes.some((type) => rule.requestTypes.includes(type))) {
        at.report("invariant", `enforces ${key}, which shares no request type with it`, ["enforces", "rules", i])
      }
    })
    rule.enforces.documents.forEach((key, i) => document(at, key, ["enforces", "documents", i]))
    rule.enforces.except.forEach((key, i) => ruleReference(at, key, ["enforces", "except", i]))
    const { sanction } = rule
    if (Array.isArray(sanction.amounts)) {
      sanction.amounts.forEach((amount, i) => operand(at, scope, amount, ["sanction", "amounts", i]))
    }
    if (sanction.after) {
      timeUnit(at, sanction.after.unit, ["sanction", "after", "unit"])
      const from = walk(at, scope, sanction.after.from, ["sanction", "after", "from"], false)
      expectDate(at, from, ["sanction", "after", "from"])
    }
    if (sanction.occurrences) {
      timeUnit(at, sanction.occurrences.within.unit, ["sanction", "occurrences", "within", "unit"])
    }
    if (sanction.repeats) {
      timeUnit(at, sanction.repeats.every.unit, ["sanction", "repeats", "every", "unit"])
      operand(at, scope, sanction.repeats.amount, ["sanction", "repeats", "amount"])
      if (sanction.repeats.from) {
        const from = walk(at, scope, sanction.repeats.from, ["sanction", "repeats", "from"], false)
        expectDate(at, from, ["sanction", "repeats", "from"])
      }
    }
    if (sanction.cap) {
      operand(at, scope, sanction.cap, ["sanction", "cap"])
    }
    sanction.suspends.forEach((key, i) => term(at, key, ["sanction", "suspends", i]))
    if (sanction.lasts !== null && typeof sanction.lasts === "object") {
      const amount = "atMost" in sanction.lasts ? sanction.lasts.atMost : sanction.lasts
      timeUnit(at, amount.unit, ["sanction", "lasts", "unit"])
    }
  }

  rulebook.rules.forEach(ruleRecord)

  // ─── Settings ────────────────────────────────────────────────────────────────────────────────────

  const settings = site("settings")
  const clauses = rulebook.settings.clauses
  const anyRequest: Scope = { subject: thing("any"), request: "any", isApplicability: false }
  if (clauses.precedence) {
    citations(settings, clauses.precedence.citations, ["clauses", "precedence", "citations"])
  }
  if (clauses.time) {
    const path = ["clauses", "time"]
    expectTerm(
      settings,
      clauses.time.days,
      [...path, "days"],
      (t) => t.kind === "unit" && (t.dimension === "elapsed-time" || t.dimension === "business-time"),
      "a unit of days"
    )
    citations(settings, clauses.time.citations, [...path, "citations"])
  }
  clauses.liability?.forEach((liability, i) => {
    const path = ["clauses", "liability", i]
    party(settings, liability.actor, [...path, "actor"])
    party(settings, liability.liable, [...path, "liable"])
    if (liability.appliesWhen) {
      condition(settings, { ...anyRequest, isApplicability: true }, liability.appliesWhen, [...path, "appliesWhen"])
    }
    if (liability.until) {
      expectDate(settings, walk(settings, anyRequest, liability.until, [...path, "until"], false), [...path, "until"])
    }
    selection(settings, anyRequest, liability.except, [...path, "except"], true)
    citations(settings, liability.citations, [...path, "citations"])
  })
  if (clauses.cure) {
    cure(settings, anyRequest, clauses.cure, ["clauses", "cure"])
    citations(settings, clauses.cure.citations, ["clauses", "cure", "citations"])
  }
  clauses.deciders?.forEach((decider, i) => {
    const path = ["clauses", "deciders", i]
    requestType(settings, decider.requestType, [...path, "requestType"])
    party(settings, decider.party, [...path, "party"])
    citations(settings, decider.citations, [...path, "citations"])
  })
  clauses.sanctionPreconditions?.forEach((precondition, i) => {
    const path = ["clauses", "sanctionPreconditions", i]
    precondition.requestTypes.forEach((key, j) => requestType(settings, key, [...path, "requestTypes", j]))
    const scope: Scope = {
      subject: thing(precondition.requestTypes),
      request: precondition.requestTypes,
      isApplicability: false
    }
    condition(settings, scope, precondition.condition, [...path, "condition"])
    selection(settings, scope, precondition.except, [...path, "except"], true)
    citations(settings, precondition.citations, [...path, "citations"])
  })

  // ─── Questions ───────────────────────────────────────────────────────────────────────────────────

  rulebook.questions.forEach((question, i) => {
    const at = site(question.id ?? `question ${i + 1}`)
    citations(at, question.citations, ["citations"])
    question.about.rules.forEach((key, j) => ruleReference(at, key, ["about", "rules", j]))
    question.about.terms.forEach((key, j) => term(at, key, ["about", "terms", j]))
    question.options.forEach((option, j) =>
      option.keeps.forEach((key, k) => ruleReference(at, key, ["options", j, "keeps", k]))
    )
  })

  // ─── Coverage (schema.md, Sources) ───────────────────────────────────────────────────────────────

  for (const provision of rulebook.provisions) {
    const isCited = cited.has(provision.key)
    if (!isCited && provision.noRule === null) {
      site(provision.key).report("coverage", "nothing cites it, and it has no reason for having no rule", ["noRule"])
    }
    if (isCited && provision.noRule !== null) {
      site(provision.key).report("coverage", "it's cited, so it has no reason for having no rule", ["noRule"])
    }
  }

  return issues
}
