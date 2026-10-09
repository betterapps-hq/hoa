import { z } from "zod"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"
import type { CandidateType } from "./candidates"
import { modelEvidence, toEvidence, type FactAnswer } from "./factSchema"

// Subjects (application-review.md, Subjects): the entities the model names, kept when their type is a candidate, plus
// the request, the lot and the community, and one work entity for the project when the model named none. What an
// entity is and how it relates are part of naming it: the run a gate is on, and a kind whose criteria fix one of its
// properties (a return fence's location is return), become readings of those properties. A reading identification gives
// at or above the fact threshold stands for its entity and property; below it, the facts stage's reading is weighed
// with it in normalization.

export const subjectsAnswerSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string().describe("A short id: run-1, gate-1, space-1."),
      type: z.string().describe("A type from the candidate types."),
      label: z.string().describe("A label a homeowner would recognize."),
      evidence: z.array(modelEvidence),
      refersTo: z
        .array(
          z.object({
            property: z.string().describe("One of its type's refersTo properties."),
            entity: z.string().describe("The id of the entity it refers to, among those you name."),
            confidence: z.number().min(0).max(1)
          })
        )
        .default([])
        .describe("What it refers to, when the packet places it: the fence run a gate is on."),
      kinds: z
        .array(
          z.object({
            kind: z.string().describe("One of its type's kinds."),
            confidence: z.number().min(0).max(1)
          })
        )
        .default([])
        .describe(
          "Which of its type's kinds it is, when the packet shows it: a run from a lot line to the house is a return fence."
        )
    })
  )
})
export type SubjectsAnswer = z.infer<typeof subjectsAnswerSchema>

export type Entity = T.EvaluationRequest["entities"][number]

/** The work: every application is about some. */
export const workType = "work"

export function requestEntities(
  answer: SubjectsAnswer,
  candidates: readonly CandidateType[],
  roots: { requestType: T.TermKey; projectLabel: string | null },
  vocabulary: Pick<EngineVocabulary, "isKindOf" | "get">
) {
  const allowed = new Set(candidates.map((candidate) => candidate.key))
  const rootIds = new Set(["request", "lot", "community"])
  const seen = new Set<string>()
  const dropped: string[] = []
  const named = answer.entities.flatMap((entity) => {
    if (!allowed.has(entity.type)) {
      dropped.push(`${entity.id} (${entity.type})`)
      return []
    }
    if (rootIds.has(entity.id) || seen.has(entity.id)) {
      dropped.push(`${entity.id} (a repeated id)`)
      return []
    }
    seen.add(entity.id)
    return [entity]
  })
  const entities: Entity[] = [
    { id: "request", type: roots.requestType, label: "The application", ref: null },
    { id: "lot", type: "lot", label: "The lot", ref: null },
    { id: "community", type: "community", label: "The community", ref: null },
    ...named.map((entity) => ({ id: entity.id, type: entity.type, label: entity.label, ref: null })),
    ...(named.some((entity) => entity.type === workType)
      ? []
      : [{ id: "work-1", type: workType, label: roots.projectLabel ?? "The project", ref: null }])
  ]
  const readings: FactAnswer[] = named.flatMap((entity) => {
    const candidate = candidates.find((item) => item.key === entity.type)
    const reading = (property: T.TermKey, value: string, confidence: number): FactAnswer => ({
      entity: entity.id,
      property,
      state: "known",
      stated: null,
      reading: value,
      evidence: entity.evidence,
      confidence
    })
    // A reference counts when its property is the type's and it names a kept entity of the type the property takes.
    const references = entity.refersTo.flatMap((reference) => {
      const property = candidate?.references.find((item) => item.property === reference.property)
      const target = named.find((item) => item.id === reference.entity)
      return property && target && (property.to === null || vocabulary.isKindOf(target.type, property.to))
        ? [reading(reference.property, target.id, reference.confidence)]
        : []
    })
    // A kind counts when it's one of the type's and its criteria fix one property's value.
    const kinds = entity.kinds.flatMap((named) => {
      const term = candidate?.categories.some((category) => category.key === named.kind)
        ? vocabulary.get(named.kind)
        : undefined
      const fixed = term?.kind === "category" ? fixedValue(term.criteria) : null
      return fixed ? [reading(fixed.property, fixed.term, named.confidence)] : []
    })
    return [...references, ...kinds]
  })
  return {
    entities,
    evidence: named.map((entity) => ({ entity: entity.id, evidence: entity.evidence.map(toEvidence) })),
    readings,
    dropped
  }
}

/** The value a category's criteria fix, when they're one equality on the subject's own property. */
function fixedValue(criteria: T.Condition) {
  if (criteria.type !== "compare" || criteria.op !== "=") {
    return null
  }
  const { left, right } = criteria
  const [property, ...rest] = left.type === "ref" && (left.from ?? "subject") === "subject" ? left.path : []
  return property !== undefined && rest.length === 0 && right.type === "value" ? { property, term: right.term } : null
}

/** The facts stage's readings with identification's, which stand for their entity and property when sure enough. */
export function withIdentified(
  answers: readonly FactAnswer[],
  identified: readonly FactAnswer[],
  threshold: number
): FactAnswer[] {
  const key = (answer: FactAnswer) => `${answer.entity} ${answer.property}`
  const settled = new Set(identified.filter((answer) => answer.confidence >= threshold).map(key))
  return [...answers.filter((answer) => !settled.has(key(answer))), ...identified]
}
