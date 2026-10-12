import * as D from "@/engine/decimal"
import { toBase, type EngineVocabulary } from "@/engine/vocabulary"
import type { ReviewResult } from "@/review/run"
import type { PageTexts } from "@/review/verifyEvidence"
import { verifyEvidence } from "@/review/verifyEvidence"
import type * as T from "@/schema/types"
import { similarity } from "@/text/match"
import type { ExpectedReview } from "./cases"

// Evaluation round 2's scores (implementation-plan.md, E2): entities, facts, normalization, evidence, findings, the
// recommendation and the action items, each from 0 to 1, with the mismatches behind them. The writer's faithfulness and
// clarity are judged by the coding agent from each case's writer.md (writerComparison.ts). The model names entities
// its own way, so expected entities are first aligned to the review's by type and label: ids only break ties, since
// the model's run-1 needn't be the expected run-1. Within a type, the pairing has the most similar labels overall.

export type ReviewScores = {
  entities: number
  facts: number
  documents: number | null
  normalization: number | null
  evidence: number | null
  findings: number
  recommendation: number
  actionItems: number
}

const roots = new Set(["request", "lot", "community"])

/** Small enough never to outweigh a difference in labels. */
const idTieBreak = 0.001

type Entity = { id: string; type: string; label: string }
type Pairing = { total: number; picks: (Entity | undefined)[] }

/** The pairing of wanted to found entities with the greatest total score; a wanted one left unpaired is undefined. */
function bestPairing(wanted: readonly Entity[], found: readonly Entity[]) {
  const score = (a: Entity, b: Entity) => similarity(a.label, b.label) + (a.id === b.id ? idTieBreak : 0)
  const memo = new Map<string, Pairing>()
  // `used` lists the found entities already paired, in order, so it also keys the memo.
  const best = (index: number, used: readonly number[]): Pairing => {
    const one = wanted[index]
    if (one === undefined) {
      return { total: 0, picks: [] }
    }
    const key = `${index} ${used.join(",")}`
    const cached = memo.get(key)
    if (cached) {
      return cached
    }
    const skip = best(index + 1, used)
    let result: Pairing = { total: skip.total, picks: [undefined, ...skip.picks] }
    for (const [slot, entity] of found.entries()) {
      if (!used.includes(slot)) {
        const rest = best(
          index + 1,
          [...used, slot].toSorted((a, b) => a - b)
        )
        const total = score(one, entity) + rest.total
        if (total > result.total) {
          result = { total, picks: [entity, ...rest.picks] }
        }
      }
    }
    memo.set(key, result)
    return result
  }
  return best(0, []).picks
}

/** Expected entity id to the review's, within each type by label similarity, ids breaking ties; roots map to themselves. */
export function alignEntities(expected: readonly Entity[], actual: readonly Entity[]) {
  const alignment = new Map<string, string>([...roots].map((id) => [id, id]))
  const free = actual.filter((entity) => !roots.has(entity.id))
  for (const [type, wanted] of Map.groupBy(expected, (entity) => entity.type)) {
    const picks = bestPairing(
      wanted,
      free.filter((entity) => entity.type === type)
    )
    wanted.forEach((entity, index) => {
      const pick = picks[index]
      if (pick) {
        alignment.set(entity.id, pick.id)
      }
    })
  }
  return alignment
}

function countsByType(entities: readonly { type: string }[]) {
  return Map.groupBy(entities, (entity) => entity.type)
}

/** A value as comparable text: a term, or a quantity in its dimension's base unit. */
function valueKey(value: T.FactValue | null, vocabulary: EngineVocabulary) {
  if (value === null) {
    return "none"
  }
  if (value.type === "value") {
    return `term ${value.term ?? value.text.toLowerCase()}`
  }
  if (value.type === "quantity") {
    const base = toBase(vocabulary, D.exact(value.value), value.unit)
    return base ? `quantity ${D.toNumber(base.value)} ${base.dimension}` : `quantity ${value.value} ${value.unit}`
  }
  return JSON.stringify(value)
}

/** A value for the report: a value no term matches is shown without its text, which may come from the packet. */
const shown = (value: T.FactValue | null, vocabulary: EngineVocabulary) =>
  value?.type === "value" && value.term === null ? "term (unlisted)" : valueKey(value, vocabulary)

const ratio = (hits: number, total: number) => (total === 0 ? 1 : hits / total)

export function scoreReview(
  result: Pick<ReviewResult, "request" | "findings" | "recommendation" | "normalizations" | "documents"> &
    Pick<ReviewResult, "changes" | "missingInformation" | "committeeDecisions">,
  expected: ExpectedReview,
  context: { vocabulary: EngineVocabulary; pageText: PageTexts }
) {
  const { vocabulary } = context
  const alignment = alignEntities(expected.entities, result.request.entities)
  const actualOf = (id: string) => alignment.get(id) ?? `unmatched:${id}`

  const wantedTypes = countsByType(expected.entities)
  const actualTypes = countsByType(result.request.entities.filter((entity) => !roots.has(entity.id)))
  const types = new Set([...wantedTypes.keys(), ...actualTypes.keys()])
  const entityMismatches = [...types].flatMap((type) => {
    const wanted = wantedTypes.get(type)?.length ?? 0
    const found = actualTypes.get(type)?.length ?? 0
    return wanted === found ? [] : [{ type, expected: wanted, actual: found }]
  })

  // An expected reference names an expected entity; the review's names the review's.
  const aligned = (value: T.FactValue | null): T.FactValue | null =>
    value?.type === "entity" ? { ...value, entity: actualOf(value.entity) } : value
  const factsOf = (entity: string, property: string) =>
    result.request.facts.filter((fact) => fact.entity === actualOf(entity) && fact.property === property)
  const factMismatches = expected.facts.flatMap((wanted) => {
    const found = factsOf(wanted.entity, wanted.property)
    // Silence is a match for unknown, and for absent where the property says silence means none.
    const isSilenceRight =
      wanted.state === "unknown" ||
      (wanted.state === "absent" && vocabulary.property(wanted.property)?.ifUnstated === "absent")
    const isMatch =
      (found.length === 0 && isSilenceRight) ||
      found.some(
        (fact) =>
          fact.state === wanted.state &&
          (wanted.state !== "known" || valueKey(fact.value, vocabulary) === valueKey(aligned(wanted.value), vocabulary))
      )
    return isMatch
      ? []
      : [
          {
            entity: wanted.entity,
            property: wanted.property,
            expected: `${wanted.state} ${shown(wanted.value, vocabulary)}`,
            actual: found.map((fact) => `${fact.state} ${shown(fact.value ?? fact.candidates[0] ?? null, vocabulary)}`)
          }
        ]
  })

  // A normalization is right when the value it gave is the expected one.
  const expectedValue = new Map(
    expected.facts.flatMap((wanted) =>
      wanted.value
        ? [[`${actualOf(wanted.entity)} ${wanted.property}`, valueKey(aligned(wanted.value), vocabulary)] as const]
        : []
    )
  )
  const normalized = result.normalizations.flatMap((normalization) => {
    const wanted = expectedValue.get(`${normalization.entity} ${normalization.property}`)
    if (wanted === undefined) {
      return []
    }
    const fact = result.request.facts.find(
      (item) => item.entity === normalization.entity && item.property === normalization.property
    )
    return [valueKey(fact?.value ?? fact?.candidates[0] ?? null, vocabulary) === wanted]
  })

  const evidence = verifyEvidence(
    result.request.facts.flatMap((fact) => fact.evidence),
    context.pageText
  )

  const documentMismatches = expected.documents.flatMap((wanted) => {
    const found = result.documents.find(
      (document) => document.ruleKey === wanted.ruleKey && document.entity === actualOf(wanted.entity)
    )
    return found?.present === wanted.present ? [] : [{ ...wanted, actual: found?.present ?? null }]
  })

  const outcomes = new Map(result.findings.map((finding) => [`${finding.ruleKey} ${finding.entity}`, finding.outcome]))
  const findingMismatches = Object.entries(expected.findings).flatMap(([key, wanted]) => {
    const [ruleKey = "", entity = ""] = key.split(" ")
    const actual = outcomes.get(`${ruleKey} ${actualOf(entity)}`) ?? null
    return actual === wanted ? [] : [{ ruleKey, entity, expected: wanted, actual }]
  })

  const itemKeys = (
    groups: Record<string, readonly { ruleKey: string; entities: readonly string[] }[]>,
    map: (id: string) => string
  ) =>
    new Set(
      Object.entries(groups).flatMap(([kind, items]) =>
        items.flatMap((item) => item.entities.map((entity) => `${kind} ${item.ruleKey} ${map(entity)}`))
      )
    )
  const wantedItems = itemKeys(expected.actionItems, actualOf)
  const actualItems = itemKeys(
    {
      changes: result.changes,
      missingInformation: result.missingInformation,
      committeeDecisions: result.committeeDecisions
    },
    (id) => id
  )
  const shared = [...wantedItems].filter((key) => actualItems.has(key)).length
  const f1 = wantedItems.size + actualItems.size === 0 ? 1 : (2 * shared) / (wantedItems.size + actualItems.size)

  const scores: ReviewScores = {
    entities: ratio(types.size - entityMismatches.length, types.size),
    facts: ratio(expected.facts.length - factMismatches.length, expected.facts.length),
    documents:
      expected.documents.length === 0
        ? null
        : ratio(expected.documents.length - documentMismatches.length, expected.documents.length),
    normalization: normalized.length === 0 ? null : ratio(normalized.filter(Boolean).length, normalized.length),
    evidence: evidence.total === 0 ? null : evidence.found / evidence.total,
    findings: ratio(
      Object.keys(expected.findings).length - findingMismatches.length,
      Object.keys(expected.findings).length
    ),
    recommendation: result.recommendation === expected.recommendation ? 1 : 0,
    actionItems: f1
  }
  return {
    scores,
    alignment: Object.fromEntries(alignment),
    mismatches: {
      entities: entityMismatches,
      facts: factMismatches,
      documents: documentMismatches,
      findings: findingMismatches,
      actionItems: {
        missing: [...wantedItems].filter((key) => !actualItems.has(key)),
        extra: [...actualItems].filter((key) => !wantedItems.has(key))
      }
    }
  }
}

export type ReviewScore = ReturnType<typeof scoreReview>
