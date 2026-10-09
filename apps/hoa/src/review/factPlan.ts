import { z } from "zod"
import { indexRulebook } from "@/engine/overrides"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"
import { valueType } from "@/schema/zod"
import { labelsOf, rulebookVocabulary } from "./documentTypes"

// The fact plan (application-review.md, Plan): every property the selected rules read, through their applicability,
// checks, subject categories and selectors, with what the model needs to answer it; and the text conditions with the
// types they're asked about. Derived properties are left out (code computes them) but what they read is planned, and so
// is the request type's governing date property, which code supplies.

const plannedValue = z.object({ key: z.string(), labels: z.array(z.string()) })
export type PlannedValue = z.infer<typeof plannedValue>

const plannedProperty = z.object({
  key: z.string(),
  /** The thing whose entities have it. */
  owner: z.string(),
  labels: z.array(z.string()),
  definition: z.string().nullable(),
  valueType,
  /** A quantity's unit, with its labels. */
  unit: plannedValue.nullable(),
  /** A choice's values, every label included. */
  values: z.array(plannedValue).nullable(),
  /** Whether a value outside the listed ones is invalid. */
  isComplete: z.boolean().nullable(),
  ifUnstated: z.enum(["unknown", "absent"]),
  many: z.boolean()
})
export type PlannedProperty = z.infer<typeof plannedProperty>

const plannedCondition = z.object({
  id: z.string(),
  text: z.string(),
  types: z.array(z.string()),
  ruleKeys: z.array(z.string())
})
export type PlannedCondition = z.infer<typeof plannedCondition>

export const factPlan = z.object({ properties: z.array(plannedProperty), conditions: z.array(plannedCondition) })
export type FactPlan = z.infer<typeof factPlan>

/** One facts call: entities, and the slice of the plan about them. */
export const entityGroup = z.object({
  id: z.string(),
  entities: z.array(z.string()),
  properties: z.array(z.string()),
  conditions: z.array(z.string())
})
export type EntityGroup = z.infer<typeof entityGroup>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type Found = { paths: Set<T.TermKey>; texts: { text: string; types: T.TermKey[]; ruleKey: T.RuleKey }[] }

/** Collects the property keys on every path, the categories tested and the text conditions in a rule's expressions. */
function walk(
  value: unknown,
  vocabulary: EngineVocabulary,
  found: Found,
  context: { types: T.TermKey[]; ruleKey: T.RuleKey },
  seen: Set<T.TermKey>
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, vocabulary, found, context, seen))
    return
  }
  if (!isRecord(value)) {
    return
  }
  if (Array.isArray(value.path)) {
    for (const key of value.path) {
      if (typeof key === "string") {
        visitProperty(key, vocabulary, found, context, seen)
      }
    }
  }
  if (value.type === "text" && typeof value.text === "string") {
    found.texts.push({ text: value.text, ...context })
  }
  if (value.type === "is-a" && typeof value.category === "string") {
    visitCategory(value.category, vocabulary, found, context, seen)
  }
  for (const [key, item] of Object.entries(value)) {
    if (key !== "path") {
      walk(item, vocabulary, found, context, seen)
    }
  }
}

function visitProperty(
  key: T.TermKey,
  vocabulary: EngineVocabulary,
  found: Found,
  context: { types: T.TermKey[]; ruleKey: T.RuleKey },
  seen: Set<T.TermKey>
) {
  const property = vocabulary.property(key)
  if (!property || seen.has(key)) {
    return
  }
  seen.add(key)
  if (property.derived) {
    walk(property.derived, vocabulary, found, { ...context, types: [vocabulary.thingOf(property.of)] }, seen)
    return
  }
  found.paths.add(key)
}

function visitCategory(
  key: T.TermKey,
  vocabulary: EngineVocabulary,
  found: Found,
  context: { ruleKey: T.RuleKey },
  seen: Set<T.TermKey>
) {
  const category = vocabulary.category(key)
  if (!category || seen.has(key)) {
    return
  }
  seen.add(key)
  walk(category.criteria, vocabulary, found, { ...context, types: [vocabulary.thingOf(category.of)] }, seen)
  visitCategory(category.of, vocabulary, found, context, seen)
}

function planProperty(vocabulary: EngineVocabulary, terms: readonly T.Term[], key: T.TermKey): PlannedProperty[] {
  const property = vocabulary.property(key)
  if (!property) {
    return []
  }
  const { valueType } = property
  const set = valueType.type === "choice" ? vocabulary.get(valueType.set) : undefined
  return [
    {
      key,
      owner: vocabulary.thingOf(property.of),
      labels: labelsOf(vocabulary, key),
      definition: property.definition,
      valueType,
      unit:
        valueType.type === "quantity" ? { key: valueType.unit, labels: labelsOf(vocabulary, valueType.unit) } : null,
      values:
        valueType.type === "choice"
          ? terms
              .filter((term) => term.kind === "value" && term.set === valueType.set)
              .map((term) => ({ key: term.key, labels: labelsOf(vocabulary, term.key) }))
          : null,
      isComplete: set?.kind === "value-set" ? set.complete : null,
      ifUnstated: property.ifUnstated,
      many: property.many
    }
  ]
}

export function planFacts(rulesFile: T.RulesFile, selected: readonly T.RuleKey[], requestType: T.TermKey): FactPlan {
  const vocabulary = rulebookVocabulary(rulesFile)
  const rulebook = indexRulebook(rulesFile)
  const terms = [...rulesFile.proposedCore, ...rulesFile.terms]
  const keys = new Set(selected)
  const found: Found = { paths: new Set(), texts: [] }
  const seen = new Set<T.TermKey>()
  for (const rule of rulesFile.rules.filter((item) => keys.has(item.key))) {
    const subjects = rule.appliesTo
      ? [rule.appliesTo]
      : rulebook.targetsOf(rule).flatMap((target) => (target.appliesTo ? [target.appliesTo] : []))
    const context = { types: [...new Set(subjects.map((key) => vocabulary.thingOf(key)))], ruleKey: rule.key }
    const expressions = rule.kind === "norm" || rule.kind === "discretion" ? [rule.appliesWhen, rule.overrides] : []
    walk([...expressions, rule.kind === "norm" ? rule.check : null], vocabulary, found, context, seen)
    if (rule.kind === "norm" && rule.check?.type === "judgment") {
      rule.check.evidence.forEach((key) => visitProperty(key, vocabulary, found, context, seen))
    }
    for (const subject of subjects) {
      visitCategory(subject, vocabulary, found, context, seen)
    }
  }
  const governing = vocabulary.requestOf(requestType)?.governingDate

  const conditions = new Map<string, PlannedCondition>()
  for (const text of found.texts) {
    const condition = conditions.get(text.text) ?? {
      id: `c${conditions.size + 1}`,
      text: text.text,
      types: [],
      ruleKeys: []
    }
    condition.types = [...new Set([...condition.types, ...text.types])]
    condition.ruleKeys = [...new Set([...condition.ruleKeys, text.ruleKey])]
    conditions.set(text.text, condition)
  }
  return {
    properties: [...found.paths]
      .filter((key) => key !== governing)
      .toSorted()
      .flatMap((key) => planProperty(vocabulary, terms, key)),
    conditions: [...conditions.values()]
  }
}

/**
 * Splits the plan into calls (application-review.md, Facts): one for the request, lot, community and work, and one per
 * other entity type (all fence runs together, all gates together). A group with nothing to ask is left out.
 */
export function entityGroups(
  plan: FactPlan,
  entities: readonly T.EvaluationRequest["entities"][number][],
  vocabulary: EngineVocabulary,
  applicationTypes: readonly T.TermKey[]
): EntityGroup[] {
  const application = new Set(applicationTypes)
  const groupOf = (type: T.TermKey) => {
    const thing = vocabulary.thingOf(type)
    return application.has(thing) ? "application" : thing
  }
  const byGroup = Map.groupBy(entities, (entity) => groupOf(entity.type))
  return [...byGroup].flatMap(([id, members]) => {
    const types = new Set(members.map((entity) => vocabulary.thingOf(entity.type)))
    const properties = plan.properties.filter((property) => types.has(property.owner)).map((property) => property.key)
    const conditions = plan.conditions
      .filter((condition) => condition.types.some((type) => types.has(type)))
      .map((condition) => condition.id)
    return properties.length > 0 || conditions.length > 0
      ? [{ id, entities: members.map((entity) => entity.id), properties, conditions }]
      : []
  })
}
