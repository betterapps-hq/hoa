import type { EntityGroup } from "./factPlan"
import type { FactAnswer } from "./factSchema"

// Two readings of low-confidence facts, reconciled (implementation-plan.md, E2.4): a fact the first reading gives a
// value for, but below the organization's fact confidence, is read again in a focused call that asks only for it. When
// both readings name the same value, the fact stands at the more confident of the two; when they don't, the first
// reading stands as it was, uncertain. An entity the first reading skipped altogether while answering others of its
// type (three items answered, the fourth left out) is read again for every property of its group, and that
// reading is its only one.

/** Whether an answer gives a value its reader wasn't confident enough in. */
const isUnsure = (answer: FactAnswer, threshold: number) =>
  (answer.state === "known" || answer.state === "uncertain") &&
  (answer.reading !== null || answer.stated !== null) &&
  answer.confidence < threshold

/** The focused calls: for each group, only the entities and properties it read below the threshold. */
export function secondReadingGroups(
  groups: readonly EntityGroup[],
  answers: readonly FactAnswer[],
  entities: readonly { id: string; type: string }[],
  threshold: number
): EntityGroup[] {
  const unsure = answers.filter((answer) => isUnsure(answer, threshold))
  const answered = new Set(answers.map((answer) => answer.entity))
  const answeredTypes = new Set(entities.filter((entity) => answered.has(entity.id)).map((entity) => entity.type))
  const isSkipped = (entity: { id: string; type: string }) => !answered.has(entity.id) && answeredTypes.has(entity.type)
  return groups.flatMap((group) => {
    const own = unsure.filter((answer) => group.entities.includes(answer.entity))
    const skipped = entities
      .filter((entity) => group.entities.includes(entity.id) && isSkipped(entity))
      .map((entity) => entity.id)
    const ids = [...new Set([...own.map((answer) => answer.entity), ...skipped])]
    const properties = [
      ...new Set([...own.map((answer) => answer.property), ...(skipped.length > 0 ? group.properties : [])])
    ]
    return ids.length > 0 ? [{ id: `${group.id}:second`, entities: ids, properties, conditions: [] }] : []
  })
}

const normalized = (text: string | null) => text?.trim().toLowerCase() ?? null

/** Two readings name the same value: the same reading, or, when either has none, the same words. */
function isSameValue(first: FactAnswer, second: FactAnswer) {
  if (first.reading !== null && second.reading !== null) {
    return JSON.stringify(first.reading) === JSON.stringify(second.reading)
  }
  return first.stated !== null && normalized(first.stated) === normalized(second.stated)
}

/** The first reading's answers, each unsure one reconciled with its second reading; then a skipped entity's answers. */
export function reconcileReadings(
  first: readonly FactAnswer[],
  second: readonly FactAnswer[],
  threshold: number
): FactAnswer[] {
  const answered = new Set(first.map((answer) => answer.entity))
  const reconciled = first.map((answer): FactAnswer => {
    if (!isUnsure(answer, threshold)) {
      return answer
    }
    const again = second.find(
      (item) =>
        item.entity === answer.entity &&
        item.property === answer.property &&
        item.state !== "absent" &&
        isSameValue(answer, item)
    )
    if (!again) {
      return answer
    }
    const surer = again.confidence > answer.confidence ? again : answer
    return {
      ...answer,
      state: answer.state === "known" || again.state === "known" ? "known" : answer.state,
      confidence: surer.confidence,
      evidence: [...answer.evidence, ...again.evidence]
    }
  })
  return [...reconciled, ...second.filter((answer) => !answered.has(answer.entity))]
}
