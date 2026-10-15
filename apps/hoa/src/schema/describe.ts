import { match, P } from "ts-pattern"
import type * as T from "./types"
import type { Vocabulary } from "./vocabulary"
import type { RuleContent } from "./zod"

// Readable sentences for rules, conditions and checks, in the organization's own labels, for screens and prompts.

const numberFormat = new Intl.NumberFormat("en-US")

function joinWith(items: string[], conjunction: "and" | "or") {
  if (items.length <= 1) {
    return items.join("")
  }
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const article = (text: string) => `${/^[aeiou]/i.test(text) ? "an" : "a"} ${text}`

export type DescribeOptions = {
  /** Writes each term but a unit as a statement link (`{{key}}`) instead of its label, for screens to render. */
  linkTerms?: boolean
}

function describer(vocabulary: Vocabulary, { linkTerms = false }: DescribeOptions) {
  const label = (key: T.TermKey, plural = false) => {
    const kind = vocabulary.get(key)?.kind
    return linkTerms && kind && kind !== "unit" ? `{{${key}${plural ? ":plural" : ""}}}` : vocabulary.label(key, plural)
  }
  // "a" or "an" goes by the label, which a link hides.
  const aTerm = (key: T.TermKey) => `${/^[aeiou]/i.test(vocabulary.label(key)) ? "an" : "a"} ${label(key)}`
  const the = (key: T.TermKey) => `the ${label(key)}`

  function amount(value: number, unit: T.TermKey) {
    const unitTerm = vocabulary.get(unit)
    const unitLabel = label(unit)
    const formatted = numberFormat.format(value)
    if (/^[^\p{L}\p{N}]+$/u.test(unitLabel)) {
      return unitTerm?.kind === "unit" && unitTerm.dimension === "money"
        ? `${unitLabel}${formatted}`
        : `${formatted}${unitLabel}`
    }
    // "1 days" reads as "1 day"
    const isOne = Math.abs(value) === 1 && /[^s]s$/.test(unitLabel)
    return `${formatted} ${isOne ? unitLabel.slice(0, -1) : unitLabel}`
  }

  function path(value: T.Path) {
    const from = value.from ?? "subject"
    if (value.path.length === 0) {
      return from === "subject" ? "it" : `the ${from}`
    }
    const owner = from === "subject" ? "its" : `the ${from}'s`
    const steps = value.path.map((key, i) => (i < value.path.length - 1 ? `${label(key)}'s` : label(key)))
    return [owner, ...steps].join(" ")
  }

  function isDate(value: T.Operand): boolean {
    return match(value)
      .with({ type: P.union("date", "governing-date", "shift") }, () => true)
      .with({ type: "ref" }, ({ path: steps }) => {
        const last = vocabulary.get(steps.at(-1) ?? "")
        return last?.kind === "property" && (last.valueType.type === "date" || last.valueType.type === "date-time")
      })
      .otherwise(() => false)
  }

  function operand(value: T.Operand): string {
    return match(value)
      .with({ type: "ref" }, (ref) => path(ref))
      .with({ type: "quantity" }, (quantity) => amount(quantity.value, quantity.unit))
      .with({ type: "fraction" }, ({ numerator, denominator }) => `${numerator}/${denominator}`)
      .with({ type: "number" }, (number) => numberFormat.format(number.value))
      .with({ type: "value" }, ({ term }) => label(term))
      .with({ type: "boolean" }, (boolean) => (boolean.value ? "yes" : "no"))
      .with({ type: P.union("date", "time") }, (constant) => constant.value)
      .with({ type: "governing-date" }, () => "the governing date")
      .with({ type: "sum" }, ({ of }) => of.map(term).join(" plus "))
      .with({ type: P.union("greatest", "least") }, (extreme) => {
        const word = extreme.type === "greatest" ? ["greater", "greatest"] : ["lesser", "least"]
        return `the ${extreme.of.length === 2 ? word[0] : word[1]} of ${joinWith(extreme.of.map(operand), "and")}`
      })
      .with({ type: "difference" }, ({ of: [a, b] }) => `${term(a)} minus ${term(b)}`)
      .with({ type: "product" }, ({ of: [a, b] }) => `${term(a)} times ${term(b)}`)
      .with({ type: "quotient" }, ({ of: [a, b] }) => `${term(a)} divided by ${term(b)}`)
      .with({ type: "count" }, (count) => `the number of ${path(count)}${where(count.where)}`)
      .with({ type: P.union("sum-of", "greatest-of", "least-of") }, (aggregate) => {
        const word = match(aggregate.type)
          .with("sum-of", () => "total")
          .with("greatest-of", () => "greatest")
          .with("least-of", () => "least")
          .exhaustive()
        const value = aggregate.value.map((key) => label(key)).join("'s ")
        return `the ${word} ${value} of ${path(aggregate)}${where(aggregate.where)}`
      })
      .with({ type: "shift" }, (shift) => {
        const direction = shift.by.value < 0 ? "minus" : "plus"
        return `${operand(shift.of)} ${direction} ${amount(Math.abs(shift.by.value), shift.by.unit)}`
      })
      .exhaustive()
  }

  // An arithmetic operand inside another, in parentheses.
  const term = (value: T.Operand) =>
    ["sum", "difference", "product", "quotient"].includes(value.type) ? `(${operand(value)})` : operand(value)

  const where = (value: T.Condition | null) => (value ? ` where ${condition(value)}` : "")

  function comparator(op: T.Comparator, isDateComparison: boolean) {
    return match(op)
      .with("=", () => "is")
      .with("!=", () => "isn't")
      .with("<", () => (isDateComparison ? "is before" : "is less than"))
      .with("<=", () => (isDateComparison ? "is on or before" : "is at most"))
      .with(">", () => (isDateComparison ? "is after" : "is more than"))
      .with(">=", () => (isDateComparison ? "is on or after" : "is at least"))
      .exhaustive()
  }

  function range(min: string | null, max: string | null, includeMin: boolean, includeMax: boolean) {
    const lower = min === null ? null : `${includeMin ? "at least" : "more than"} ${min}`
    const upper = max === null ? null : `${includeMax ? "at most" : "less than"} ${max}`
    return [lower, upper].filter((bound) => bound !== null).join(" and ")
  }

  function parties(keys: T.TermKey[], needs: "all" | "any") {
    return joinWith(keys.map(the), needs === "all" ? "and" : "or")
  }

  function approval(test: T.ApprovalTest) {
    return [
      `approved by ${parties(test.by, test.needs)}`,
      test.written ? "in writing" : null,
      test.prior ? "beforehand" : null
    ]
      .filter((part) => part !== null)
      .join(" ")
  }

  function offset(value: T.Offset, anchor: string) {
    const at = value.at ? ` at ${value.at}` : ""
    if (value.value === 0) {
      return `${anchor}${at}`
    }
    const direction = value.value < 0 ? "before" : "after"
    return `${amount(Math.abs(value.value), value.unit)} ${direction} ${anchor}${at}`
  }

  function timeWindow(window: T.TimeWindow) {
    return match(window)
      .with({ type: "daily" }, ({ from, to }) => `${from} to ${to} each day`)
      .with({ type: "weekly" }, ({ days, from, to }) => {
        const hours = from && to ? ` ${from} to ${to}` : ""
        return `${joinWith(days, "and")}${hours} each week`
      })
      .with({ type: "annual" }, ({ from, to }) => `${from} to ${to} each year`)
      .with({ type: "recurring" }, (recurring) => {
        const each = `each date of ${operand(recurring.schedule)}`
        const from = recurring.from ? offset(recurring.from, "the date") : "the date"
        const to = recurring.to ? offset(recurring.to, "the date") : "the date"
        return `${from} to ${to}, around ${each}`
      })
      .exhaustive()
  }

  function condition(value: T.Condition): string {
    return match(value)
      .with({ type: P.union("all", "any") }, (group) =>
        joinWith(
          group.of.map((item) =>
            item.type === "all" || item.type === "any" ? `(${condition(item)})` : condition(item)
          ),
          group.type === "all" ? "and" : "or"
        )
      )
      .with({ type: "not" }, ({ of }) => `it's not the case that ${condition(of)}`)
      .with({ type: "compare" }, ({ left, op, right }) => {
        const isDateComparison = isDate(left) || isDate(right)
        return `${operand(left)} ${comparator(op, isDateComparison)} ${operand(right)}`
      })
      .with({ type: "in" }, ({ left, values }) => `${operand(left)} is ${joinWith(values.map(operand), "or")}`)
      .with(
        { type: "between" },
        (between) =>
          `${operand(between.left)} is ${range(operand(between.min), operand(between.max), between.includeMin, between.includeMax)}`
      )
      .with({ type: "exists" }, (exists) => `${path(exists)} exists`)
      .with({ type: "is-a" }, (isA) => `${path(isA)} is ${aTerm(isA.category)}`)
      .with({ type: "approved" }, (approved) => `${path(approved)} was ${approval(approved)}`)
      .with({ type: P.union("every", "some", "none") }, (quantifier) => {
        const which = match(quantifier.type)
          .with("every", () => "each of")
          .with("some", () => "at least one of")
          .with("none", () => "none of")
          .exhaustive()
        return `${which} ${path(quantifier)}${where(quantifier.where)} meets this: ${condition(quantifier.test)}`
      })
      .with({ type: "during" }, (during) => {
        const span = `the time from ${operand(during.start)} to ${operand(during.end)}`
        return `${span} ${during.match === "within" ? "falls within" : "overlaps"} ${timeWindow(during.window)}`
      })
      .with({ type: "text" }, ({ text }) => `"${text}"`)
      .exhaustive()
  }

  function cell(input: string, value: T.Cell) {
    return match(value)
      .with({ type: "any" }, () => null)
      .with({ type: "in" }, ({ values }) => `${input} is ${joinWith(values.map(operand), "or")}`)
      .with({ type: "not-in" }, ({ values }) => `${input} isn't ${joinWith(values.map(operand), "or")}`)
      .with({ type: "range" }, (bounds) => {
        const min = bounds.min ? operand(bounds.min) : null
        const max = bounds.max ? operand(bounds.max) : null
        return `${input} is ${range(min, max, bounds.includeMin, bounds.includeMax)}`
      })
      .exhaustive()
  }

  const outcome = (result: "met" | "not-met") => (result === "met" ? "met" : "not met")

  function check(value: T.Check): string {
    return match(value)
      .with({ type: "test" }, ({ test }) => condition(test))
      .with({ type: "table" }, (table) => {
        const inputs = table.inputs.map(operand)
        const when = (row: (typeof table.rows)[number]) => {
          const cells = row.when.map((item, i) => cell(inputs[i] ?? "", item)).filter((text) => text !== null)
          return cells.length > 0 ? joinWith(cells, "and") : "anything"
        }
        // The usual table lists what complies: one of its rows holds.
        if (table.otherwise === "not-met" && table.rows.every((row) => row.result === "met")) {
          return `one of these holds: ${table.rows.map(when).join("; or ")}`
        }
        const rows = table.rows.map((row) => `${outcome(row.result)} when ${when(row)}`)
        return `the table says ${rows.join("; ")}; otherwise ${outcome(table.otherwise)}`
      })
      .with({ type: "document" }, (document) => {
        const each = document.per === "subject" ? " for each one" : ""
        const states = document.mustState.length > 0 ? `, stating ${joinWith(document.mustState, "and")}` : ""
        const signed = document.signedBy.length > 0 ? `, signed by ${parties(document.signedBy, "all")}` : ""
        return `${aTerm(document.document)} is provided${each}${states}${signed}`
      })
      .with({ type: "deadline" }, (deadline) => {
        const anchor = operand(deadline.anchor)
        const earliest = deadline.earliest ? offset(deadline.earliest, anchor) : null
        const latest = deadline.latest ? offset(deadline.latest, anchor) : null
        const window = match([earliest, latest])
          .with([P.string, P.string], ([from, to]) => `between ${from} and ${to}`)
          .with([P.string, null], ([from]) => `no earlier than ${from}`)
          .with([null, P.string], ([, to]) => `no later than ${to}`)
          .otherwise(() => `at any time after ${anchor}`)
        const deemed = deadline.onMiss.map((effect) => `${path(effect.target)} is deemed ${operand(effect.value)}`)
        const onMiss = deemed.length > 0 ? `; if not, ${joinWith(deemed, "and")}` : ""
        return `${operand(deadline.act)} is ${window}${onMiss}`
      })
      .with({ type: "judgment" }, (judgment) => {
        const evidence =
          judgment.evidence.length > 0
            ? ` (judged from ${joinWith(
                judgment.evidence.map((key) => label(key)),
                "and"
              )})`
            : ""
        return `the answer to "${judgment.question}" is yes${evidence}`
      })
      .with({ type: "approval" }, (test) => `it was ${approval(test)}`)
      .exhaustive()
  }

  function selection(value: T.RuleSelection) {
    if (Array.isArray(value)) {
      return joinWith(value, "and")
    }
    const sources = [
      ...value.documents.map((key) => `every rule in ${key}`),
      ...value.provisions.map((key) => `every rule under ${key}`)
    ]
    const after = value.adoptedAfter ? ` adopted after ${path(value.adoptedAfter)}` : ""
    const except = value.except.length > 0 ? `, except ${joinWith(value.except, "and")}` : ""
    return `${joinWith(sources, "and")}${after}${except}`
  }

  function rule(value: RuleContent) {
    const subject =
      value.appliesTo.length > 0
        ? `each ${joinWith(
            value.appliesTo.map((key) => label(key)),
            "or"
          )}`
        : "the subjects of the rules it overrides"
    const scope = `${subject}${where(value.appliesWhen)}`
    const sentence = match(value)
      .with({ kind: "norm" }, (norm) => {
        const bearer = norm.bearer.length > 0 ? parties(norm.bearer, "any") : "the request"
        const overrides =
          Array.isArray(norm.overrides) && norm.overrides.length === 0
            ? ""
            : `, overriding ${selection(norm.overrides)}`
        const checked = norm.check ? check(norm.check) : ""
        return match(norm.modality)
          .with("obligation", () => `${capitalize(bearer)} must ensure, for ${scope}, that ${checked}${overrides}.`)
          .with("recommendation", () => `${capitalize(bearer)} should ensure, for ${scope}, that ${checked}.`)
          .with("requirement", () => `For ${scope} to take effect: ${checked}.`)
          .with("prohibition", () => `${capitalize(scope)} is prohibited for ${bearer}${overrides}.`)
          .with("permission", () => `${capitalize(scope)} is permitted to ${bearer}${overrides}.`)
          .exhaustive()
      })
      .with(
        { kind: "discretion" },
        (discretion) =>
          `${capitalize(parties(discretion.decidedBy, "any"))} decides case by case for ${scope}, over ${selection(discretion.overrides)}.`
      )
      .with({ kind: "sanction" }, (sanction) => {
        const verb = sanction.modality === "obligation" ? "must" : "may"
        const enforced = [
          ...sanction.enforces.rules,
          ...sanction.enforces.documents.map((document) => `a rule in ${document}`)
        ]
        const amounts = match(sanction.sanction.amounts)
          .with("none", () => "")
          .with("set-by-imposer", () => " in an amount it sets")
          .with(P.array(), (list) => ` of ${list.map(operand).join(", then ")}`)
          .exhaustive()
        const repeats = sanction.sanction.repeats
          ? `, plus ${operand(sanction.sanction.repeats.amount)} every ${amount(sanction.sanction.repeats.every.value, sanction.sanction.repeats.every.unit)}`
          : ""
        const cap = sanction.sanction.cap ? `, up to ${operand(sanction.sanction.cap)}` : ""
        return (
          `${capitalize(parties(sanction.imposedBy, "any"))} ${verb} impose ${article(sanction.sanction.type.replaceAll("-", " "))}` +
          `${amounts}${repeats}${cap} ` +
          `on ${parties(sanction.against, "any")} when ${joinWith(enforced, "or")} isn't met, for ${scope}.`
        )
      })
      .with({ kind: "limit" }, (limit) => {
        const caps = [
          limit.forbids ? "forbids them" : null,
          limit.maxAmount ? `allows at most ${operand(limit.maxAmount)} each time` : null,
          limit.maxTotal ? `allows at most ${operand(limit.maxTotal)} in total` : null
        ].filter((part) => part !== null)
        return `Limits ${joinWith(limit.limits, "and")} for ${scope}: ${joinWith(caps, "and")}.`
      })
      .exhaustive()
    return `${sentence} Runs in ${joinWith(
      value.requestTypes.map((key) => label(key, true)),
      "and"
    )}.`
  }

  return { condition, check, rule }
}

export const describeRule = (rule: RuleContent, vocabulary: Vocabulary, options: DescribeOptions = {}) =>
  describer(vocabulary, options).rule(rule)

export const describeCondition = (condition: T.Condition, vocabulary: Vocabulary, options: DescribeOptions = {}) =>
  describer(vocabulary, options).condition(condition)

export const describeCheck = (check: T.Check, vocabulary: Vocabulary, options: DescribeOptions = {}) =>
  describer(vocabulary, options).check(check)
