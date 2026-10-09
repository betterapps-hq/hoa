import { z } from "zod"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"
import type { FactPlan, PlannedProperty } from "./factPlan"

// The facts call's answer, typed by its slice of the fact plan (application-review.md, Plan): one branch per planned
// property, keyed by the property, with a reading of that property's type and entities of its owner's type, so the
// model can't answer a property nobody asked for.

/** Evidence as the models give it: a file, a page and a short quote. */
export const modelEvidence = z.object({
  fileId: z.string().describe("The file id from the page marker."),
  page: z.number().int().positive().nullable().describe("The page index from the page marker."),
  quote: z
    .string()
    .nullable()
    .describe("A short verbatim quote from that page, or the words of the image description it relies on.")
})
export type ModelEvidence = z.infer<typeof modelEvidence>

export const toEvidence = (evidence: ModelEvidence): T.Evidence => ({ ...evidence, region: null })

export const factStates = ["known", "absent", "conflicting", "uncertain"] as const

/** One answered property for one entity, before code normalizes it. */
export type FactAnswer = {
  entity: string
  property: string
  state: (typeof factStates)[number]
  stated: string | null
  reading: unknown
  evidence: ModelEvidence[]
  confidence: number
}

export type ConditionResponse = {
  condition: string
  entity: string
  answer: "yes" | "no" | "unknown"
  evidence: ModelEvidence[]
}

export type FactsAnswer = { facts: FactAnswer[]; conditions: ConditionResponse[] }

/** What the schema needs to type readings: the request's entities, and the vocabulary for units and parties. */
export type FactSchemaContext = {
  entities: readonly T.EvaluationRequest["entities"][number][]
  vocabulary: EngineVocabulary
  /** Every unit term, for quantities of the same dimension. */
  units: readonly { key: T.TermKey; dimension: T.Dimension }[]
}

const enumOr = (values: readonly string[]) => {
  const [first, ...rest] = values
  return first === undefined ? z.string() : z.enum([first, ...rest])
}

function readingOf(property: PlannedProperty, context: FactSchemaContext): z.ZodType {
  const { valueType } = property
  switch (valueType.type) {
    case "quantity": {
      const dimension = context.vocabulary.unit(valueType.unit)?.dimension
      const units = context.units.filter((unit) => unit.dimension === dimension).map((unit) => unit.key)
      return z.object({ value: z.number(), unit: enumOr(units.length > 0 ? units : [valueType.unit]) })
    }
    case "count":
      return z.number().int().nonnegative()
    case "boolean":
      return z.boolean()
    case "choice":
      return enumOr(property.values?.map((value) => value.key) ?? []).describe(
        "The key of the allowed value the stated value names, as a plain string; null when it names none of them."
      )
    case "reference": {
      const { to } = valueType
      const ids = context.entities
        .filter((entity) => to === null || context.vocabulary.isKindOf(entity.type, to))
        .map((entity) => entity.id)
      return enumOr(ids).describe("The id of the entity it refers to.")
    }
    case "date":
      return z.string().describe("The date as YYYY-MM-DD.")
    case "date-time":
      return z.string().describe("The date and time as YYYY-MM-DDTHH:MM.")
    case "time-of-day":
      return z.string().describe("The time as HH:MM, 24-hour.")
    case "party":
      return z.string().describe("Who it is, by role (owner, contractor), never by name.")
    case "schedule":
    case "text":
      return z.string()
  }
}

/** The entity a facts answer names for a value every entity of the property's type in the call shares. */
export const everyEntity = "all"

type Group = { entities: readonly string[]; properties: readonly T.TermKey[]; conditions: readonly string[] }

/** The call's entities a property is asked of: those of the property's type. */
function askedOf(property: Pick<PlannedProperty, "owner">, group: Group, context: Omit<FactSchemaContext, "units">) {
  return context.entities.filter(
    (entity) => group.entities.includes(entity.id) && context.vocabulary.thingOf(entity.type) === property.owner
  )
}

/** An answer for every entity of a type (one color for the whole fence) as one answer per entity without its own. */
export function expandShared(
  answer: FactsAnswer,
  plan: FactPlan,
  group: Group,
  context: Omit<FactSchemaContext, "units">
): FactsAnswer {
  const own = answer.facts.filter((fact) => fact.entity !== everyEntity)
  const answered = new Set(own.map((fact) => `${fact.entity} ${fact.property}`))
  const shared = answer.facts.flatMap((fact) => {
    const property = plan.properties.find((item) => item.key === fact.property)
    return fact.entity === everyEntity && property
      ? askedOf(property, group, context)
          .filter((entity) => !answered.has(`${entity.id} ${fact.property}`))
          .map((entity) => ({ ...fact, entity: entity.id }))
      : []
  })
  return { ...answer, facts: [...own, ...shared] }
}

export function factsAnswerSchema(plan: FactPlan, group: Group, context: FactSchemaContext): z.ZodType<FactsAnswer> {
  const properties = plan.properties.filter((property) => group.properties.includes(property.key))
  const branches = properties.map((property) => {
    const ids = askedOf(property, group, context).map((entity) => entity.id)
    return z.object({
      property: z.literal(property.key),
      entity:
        ids.length > 1
          ? enumOr([...ids, everyEntity]).describe(
              `The entity's id, or "${everyEntity}" for a value all of them share.`
            )
          : enumOr(ids),
      state: z.enum(factStates),
      stated: z
        .string()
        .nullable()
        .describe("The value exactly as the packet writes it; null when only drawn or shown."),
      reading: readingOf(property, context).nullable(),
      evidence: z.array(modelEvidence),
      confidence: z.number().min(0).max(1)
    })
  })
  const [first, ...rest] = branches
  const union = first && rest.length > 0 ? z.discriminatedUnion("property", [first, ...rest]) : null
  const fact = union ?? first ?? z.never()
  const conditions = z.object({
    condition: enumOr(group.conditions),
    entity: enumOr(group.entities),
    answer: z.enum(["yes", "no", "unknown"]),
    evidence: z.array(modelEvidence)
  })
  return z.object({
    facts: z.array(fact).describe("One entry per property and entity the packet answers; leave out what it doesn't."),
    conditions: z.array(conditions).default([])
  })
}
