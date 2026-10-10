import type { EncodingPatchContent } from "@/schema/zod"
import { questionId } from "./merge"

// Repair (encoding.md, Repair): the model answers with a patch, only the records it changes, adds or removes, and code
// applies it to the unit's answer, which verify then checks again. The answer may have failed Zod, so the patch is
// applied to it as given: records are matched by their `key` wherever the answer has one.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const keyOf = (item: unknown) => (isRecord(item) && typeof item.key === "string" ? item.key : null)

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

type Removals = { removed: unknown[]; missing: string[] }

/** The items without those whose key is listed, and the listed keys no item has. */
function withoutKeys(items: readonly unknown[], keys: readonly string[]): Removals {
  const listed = new Set(keys)
  const present = new Set(items.map(keyOf))
  return {
    removed: items.filter((item) => {
      const key = keyOf(item)
      return key === null || !listed.has(key)
    }),
    missing: keys.filter((key) => !present.has(key))
  }
}

/** The items with each replacement in place of the item with its key, and the rest appended in order. */
function upsert(items: readonly unknown[], replacements: readonly { key: string }[]) {
  const result = [...items]
  for (const replacement of replacements) {
    const index = result.findIndex((item) => keyOf(item) === replacement.key)
    if (index < 0) {
      result.push(replacement)
    } else {
      result[index] = replacement
    }
  }
  return result
}

export type AppliedPatch = {
  answer: Record<string, unknown>
  /** What the patch named that the answer doesn't have: keys it removes, questions it replaces. */
  unmatched: string[]
}

/** Applies a repair's patch to a unit's answer (encoding.md, Repair). */
export function applyPatch(answer: unknown, patch: EncodingPatchContent): AppliedPatch {
  const base = isRecord(answer) ? answer : {}
  const unmatched: string[] = []
  const keyed = (name: "terms" | "rules" | "referencedDocuments", remove: readonly string[]) => {
    const { removed, missing } = withoutKeys(listOf(base[name]), remove)
    unmatched.push(...missing.map((key) => `${name} ${key}`))
    return removed
  }

  // Questions have ids by position (question-1 is the first), so replacements and removals use the answer's positions.
  const questions: unknown[] = [...listOf(base.questions)]
  const removedQuestions = new Set<number>()
  for (const id of patch.remove.questions) {
    const index = questions.findIndex((_question, i) => questionId(i + 1) === id)
    if (index < 0) {
      unmatched.push(`questions ${id}`)
    } else {
      removedQuestions.add(index)
    }
  }
  const added: unknown[] = []
  for (const { replaces, ...question } of patch.questions) {
    const index = replaces === null ? -1 : questions.findIndex((_question, i) => questionId(i + 1) === replaces)
    if (index < 0) {
      if (replaces !== null) {
        unmatched.push(`questions ${replaces}`)
      }
      added.push(question)
    } else {
      questions[index] = question
    }
  }

  const clauses = isRecord(base.clauses) ? { ...base.clauses } : {}
  for (const name of patch.remove.clauses) {
    if (!(name in clauses)) {
      unmatched.push(`clauses ${name}`)
    }
    delete clauses[name]
  }

  return {
    answer: {
      ...base,
      provisions: upsert(listOf(base.provisions), patch.provisions),
      terms: upsert(keyed("terms", patch.remove.terms), patch.terms),
      rules: upsert(keyed("rules", patch.remove.rules), patch.rules),
      questions: [...questions.filter((_question, i) => !removedQuestions.has(i)), ...added],
      clauses: { ...clauses, ...patch.clauses },
      referencedDocuments: upsert(
        keyed("referencedDocuments", patch.remove.referencedDocuments),
        patch.referencedDocuments
      ),
      notes: [...listOf(base.notes), ...patch.notes]
    },
    unmatched
  }
}
