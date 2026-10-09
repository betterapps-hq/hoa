import * as D from "@/engine/decimal"
import { toBase, type EngineVocabulary } from "@/engine/vocabulary"
import type { ReviewResult } from "@/review/run"
import type { PageTexts } from "@/review/verifyEvidence"
import { verifyEvidence } from "@/review/verifyEvidence"
import type * as T from "@/schema/types"
import { similarity } from "@/text/match"
import type { ExpectedReview } from "./cases"
import { writerScore, type ReviewJudgeAnswer } from "./judge"

// Evaluation round 2's scores (implementation-plan.md, E2): entities, facts, normalization, evidence, findings, the
// recommendation and the action items, each from 0 to 1, with the mismatches behind them. The model names entities
// its own way, so expected entities are first aligned to the review's by type and label: ids only break ties, since
// the model's run-1 needn't be the expected run-1.

export type ReviewScores = {
  entities: number
  facts: number
  documents: number | null
  normalization: number | null
  evidence: number | null
  findings: number
  recommendation: number
  actionItems: number
  /** The writer judge's score, when the run asked it. */
  writer: number | null
}

const roots = new Set(["request", "lot", "community"])

/** Small enough never to outweigh a difference in labels. */
const idTieBreak = 0.001

/** Expected entity id to the review's, within each type by label similarity, ids breaking ties; roots map to themselves. */
export function alignEntities(
  expected: ExpectedReview["entities"],
  actual: readonly T.EvaluationRequest["entities"][number][]
) {
  const alignment = new Map<string, string>([...roots].map((id) => [id, id]))
  const free = actual.filter((entity) => !roots.has(entity.id))
  const pairs = expected
    .flatMap((wanted) =>
      free
        .filter((entity) => entity.type === wanted.type)
        .map((entity) => ({
          wanted,
          entity,
          score: similarity(wanted.label, entity.label) + (wanted.id === entity.id ? idTieBreak : 0)
        }))
    )
    .toSorted((a, b) => b.score - a.score)
  const used = new Set<string>()
  for (const { wanted, entity } of pairs) {
    if (!alignment.has(wanted.id) && !used.has(entity.id)) {
      alignment.set(wanted.id, entity.id)
      used.add(entity.id)
    }
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
  context: { vocabulary: EngineVocabulary; pageText: PageTexts; judged?: ReviewJudgeAnswer }
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
    actionItems: f1,
    writer: context.judged ? writerScore(context.judged) : null
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
      },
      // The parts the judge faulted, without its reasons, which may quote the packet.
      writer: (context.judged?.parts ?? []).flatMap((part) =>
        part.faithful && part.clear
          ? []
          : [
              `${part.part}: ${[part.faithful ? "" : "not faithful", part.clear ? "" : "not clear"].filter(Boolean).join(", ")}`
            ]
      )
    }
  }
}

export type ReviewScore = ReturnType<typeof scoreReview>
