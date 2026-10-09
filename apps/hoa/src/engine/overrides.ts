import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import { appliesOn, documentKeyOf, isConsidered, mainProvision } from "./applicability"
import { toDay } from "./calendar"
import { compareValues } from "./conditions"
import type { Context, Input } from "./context"
import * as D from "./decimal"
import { evaluateRef } from "./operands"
import * as V from "./values"

// Overrides (schema.md, Overrides; Rank and conflicts): selectors resolved, invalid overrides ignored, and then, on
// one subject, displaced, exempt or decided by.

export type Effect = "displaced" | "exempt" | "decided-by"

export type Rulebook = {
  rules: T.Rule[]
  documents: Map<string, T.GoverningDocument>
  /** The rules that validly override a rule, before any per-subject condition. */
  overridersOf: (rule: T.Rule) => OverridingRule[]
  /** The rules a rule overrides, before any per-subject condition. */
  targetsOf: (rule: T.Rule) => T.Rule[]
}

const law = new Set<T.DocumentKind>(["statute", "ordinance"])

type OverridingRule = T.NormRule | T.DiscretionRule
const isOverriding = (rule: T.Rule): rule is OverridingRule => rule.kind === "norm" || rule.kind === "discretion"

export function indexRulebook(file: T.RulesFile): Rulebook {
  const documents = new Map(file.documents.map((document) => [document.key, document]))
  const parents = new Map(
    file.provisions.map((provision) => {
      const documentKey = documentKeyOf(provision.key)
      return [provision.key, provision.parentLabel === null ? null : `${documentKey}:${provision.parentLabel}`]
    })
  )
  const { order } = file.settings.clauses.precedence

  // A decision rule ranks as the document of the provision granting its power.
  const kindOf = (rule: T.Rule) => {
    const kind = documents.get(documentKeyOf(mainProvision(rule)))?.kind
    if (kind === "decision" && rule.authority) {
      return documents.get(documentKeyOf(rule.authority.provisionKey))?.kind
    }
    return kind
  }
  const rank = (rule: T.Rule) => {
    const kind = kindOf(rule)
    const index = order.findIndex((kinds) => kind !== undefined && kinds.includes(kind))
    return index === -1 ? order.length : index
  }
  const isUnder = (provisionKey: string, ancestor: string) => {
    const seen = new Set<string>()
    for (let key: string | null | undefined = provisionKey; key && !seen.has(key); key = parents.get(key)) {
      if (key === ancestor) {
        return true
      }
      seen.add(key)
    }
    return false
  }
  const selects = (selection: T.RuleSelection, target: T.Rule) => {
    if (Array.isArray(selection)) {
      return selection.includes(target.key)
    }
    const provision = mainProvision(target)
    return (
      !selection.except.includes(target.key) &&
      (selection.documents.includes(documentKeyOf(provision)) ||
        selection.provisions.some((ancestor) => isUnder(provision, ancestor)))
    )
  }
  const isValid = (overrider: T.Rule, target: T.Rule) => {
    const kind = kindOf(overrider)
    const isLaw = kind !== undefined && law.has(kind)
    return (
      overrider.key !== target.key &&
      rank(overrider) <= rank(target) &&
      (target.kind !== "norm" || !target.noExceptions || isLaw)
    )
  }

  const overriders = file.rules.filter(isOverriding)
  const cache = new Map<string, OverridingRule[]>()
  return {
    rules: file.rules,
    documents,
    overridersOf: (target) => {
      const cached = cache.get(target.key)
      if (cached) {
        return cached
      }
      const found = overriders
        .filter((rule) => selects(rule.overrides, target) && isValid(rule, target))
        .toSorted((a, b) => rank(a) - rank(b) || b.effectiveFrom.localeCompare(a.effectiveFrom))
      cache.set(target.key, found)
      return found
    },
    targetsOf: (rule) => (isOverriding(rule) ? file.rules.filter((target) => selects(rule.overrides, target)) : [])
  }
}

const effectOf = (rule: T.Rule): Effect | null =>
  match(rule)
    .returnType<Effect | null>()
    .with({ kind: "discretion" }, () => "decided-by")
    .with({ kind: "norm", modality: "permission" }, () => "exempt")
    .with({ kind: "norm", modality: "requirement" }, () => null)
    .with({ kind: "norm" }, () => "displaced")
    .otherwise(() => null)

/** An overriding rule on one subject, with the facts that decided whether it applies. */
export type Override = { rule: OverridingRule; effect: Effect; reads: Input[] }

/** The overriding rules on one subject: those that apply, and those it's unknown whether they apply. */
export type Overrides = {
  applying: Override[] // highest rank first, then latest effective
  unknown: Override[]
}

// Grandfathering: a selector's adoptedAfter keeps only rules that took effect after the date at its path.
function isAdoptedAfter(context: Context, overrider: OverridingRule, target: T.Rule, subject: string): V.Truth {
  const selection = overrider.overrides
  if (Array.isArray(selection) || !selection.adoptedAfter) {
    return true
  }
  const date = evaluateRef(context, { subject: { type: "entity", id: subject } }, selection.adoptedAfter)
  const effective = V.known({ type: "date", range: V.point(D.integer(toDay(target.effectiveFrom))) })
  return compareValues(context, effective, ">", date)
}

export function overridesOn(
  context: Context,
  rulebook: Rulebook,
  target: T.Rule,
  subject: string,
  visiting: Set<string> = new Set()
): Overrides {
  const overrides: Overrides = { applying: [], unknown: [] }
  visiting.add(target.key)
  for (const rule of rulebook.overridersOf(target)) {
    const effect = effectOf(rule)
    // Discretion applies only where a body is about to decide (schema.md, Approval versus discretion).
    const isInFlow = effect !== "decided-by" || context.flow === "application"
    if (!effect || !isInFlow || !isConsidered(context, rule) || visiting.has(rule.key)) {
      continue
    }
    // Each rule's reads are its own: they become a finding's inputs only if that rule decides it.
    const outer = context.reads
    context.reads = []
    const applies = V.all([
      appliesOn(context, rulebook.documents, rule, subject),
      isAdoptedAfter(context, rule, target, subject),
      V.not(isSetAside(context, rulebook, rule, subject, visiting))
    ])
    const { reads } = context
    context.reads = outer
    if (applies !== false) {
      overrides[applies ? "applying" : "unknown"].push({ rule, effect, reads })
    }
  }
  visiting.delete(target.key)
  return overrides
}

// A rule that is itself displaced or exempted on the subject has no effect.
function isSetAside(
  context: Context,
  rulebook: Rulebook,
  rule: T.Rule,
  subject: string,
  visiting: Set<string>
): V.Truth {
  const { applying, unknown } = overridesOn(context, rulebook, rule, subject, visiting)
  const setsAside = ({ effect }: Override) => effect !== "decided-by"
  context.reads.push(...[...applying, ...unknown].filter(setsAside).flatMap(({ reads }) => reads))
  if (applying.some(setsAside)) {
    return true
  }
  return unknown.some(setsAside) ? null : false
}
