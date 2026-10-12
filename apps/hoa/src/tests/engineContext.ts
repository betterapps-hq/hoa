import { type Answers, type Context, createContext } from "@/engine/context"
import { deriveProperty } from "@/engine/derived"
import { createEngineVocabulary } from "@/engine/vocabulary"
import { exampleRulesFile } from "@/schema/exampleRulebook.test-data"
import type * as T from "@/schema/types"

// Requests and contexts over the schema's examples, for the engine's unit tests.

export const examples = exampleRulesFile()

const extracted = { by: "extraction" as const, at: "2026-02-03T15:00:00Z" }

export const entity = (id: string, type: string, ref: string | null = null) => ({ id, type, label: id, ref })

export function fact(
  entityId: string,
  property: string,
  value: T.FactValue | null,
  state: T.Fact["state"] = "known"
): T.Fact {
  return {
    entity: entityId,
    property,
    state,
    value,
    candidates: [],
    complete: null,
    stated: null,
    evidence: [],
    confidence: state === "known" ? 0.95 : null,
    provenance: extracted
  }
}

export const term = (key: string, text = key): T.FactValue => ({ type: "value", term: key, text })
export const quantity = (value: number, unit = "inch"): T.FactValue => ({ type: "quantity", value, unit })
export const date = (value: string): T.FactValue => ({ type: "date", value })
export const dateTime = (value: string): T.FactValue => ({ type: "date-time", value })
export const reference = (id: string): T.FactValue => ({ type: "entity", entity: id })
export const yes: T.FactValue = { type: "boolean", value: true }
export const no: T.FactValue = { type: "boolean", value: false }

/** A request over the examples: an application submitted 2026-02-03 unless the parts say otherwise. */
export function exampleRequest(parts: Partial<T.EvaluationRequest> = {}): T.EvaluationRequest {
  return {
    organizationId: "org-sample",
    type: "architectural-application",
    governingDate: "2026-02-03",
    evaluationDate: "2026-02-03",
    lot: "lot",
    entities: [
      entity("request", parts.type ?? "architectural-application"),
      entity("lot", "lot"),
      entity("community", "community")
    ],
    facts: [],
    documents: [],
    ...parts
  }
}

/** A context over the examples, with its request's base entities plus the given ones. */
export function exampleContext(
  parts: Partial<T.EvaluationRequest> & { extra?: T.EvaluationRequest["entities"] } = {},
  answers: Partial<Answers> = {},
  file: T.RulesFile = examples
): Context {
  const { extra = [], ...requestParts } = parts
  const request = exampleRequest(requestParts)
  return createContext({
    vocabulary: createEngineVocabulary([...file.proposedCore, ...file.terms]),
    request: { ...request, entities: [...request.entities, ...extra] },
    settings: file.settings,
    answers: { documentReviews: [], judgments: [], conditionAnswers: [], ...answers },
    derive: deriveProperty
  })
}
