import {
  consolidateOutput,
  encodeOutput,
  mergeOutput,
  repairOutput,
  unitProblems,
  unitState,
  vocabularyOutput
} from "@/encoding/stepOutputs"

// A running build's results so far (encoding.md, UX, Results as they arrive): what each finished step produced, read
// from the step outputs the build writes to storage, newest since a cursor. Nothing here is reviewable: review happens
// in the draft. The page polls this every few seconds.

/** One step's result, as the page shows it. `at` is when the step's output was written. */
export type BuildResult = { id: string; at: string } & (
  | { kind: "terms"; documentId: string; labels: string[]; isReused: boolean }
  | {
      kind: "rules"
      unitId: string
      rules: { key: string; title: string; provisionKey: string | null }[]
      /** Whether the answer passed Zod; a failing one goes to repair. */
      isValid: boolean
    }
  | { kind: "checked"; unitId: string; problems: number }
  | { kind: "repaired"; unitId: string; round: number; problemsLeft: number | null }
  | { kind: "checked-together"; unitsWithProblems: number; problems: number }
  | { kind: "combined"; conflicts: number }
  | { kind: "consolidated"; problems: number; conflicts: number }
)

/** The part of an R2 bucket the results read. */
export type ResultsBucket = {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string; uploaded: Date }[]
    truncated: boolean
    cursor?: string
  }>
  get(key: string): Promise<{ text(): Promise<string> } | null>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The rules an encode answer drafted, read leniently: an answer that failed Zod still shows what it has. */
function draftedRules(answer: unknown) {
  const rules = isRecord(answer) && Array.isArray(answer.rules) ? answer.rules : []
  return rules.flatMap((rule) => {
    if (!isRecord(rule) || typeof rule.key !== "string") {
      return []
    }
    const [first] = Array.isArray(rule.citations) ? rule.citations : []
    const provisionKey = isRecord(first) && typeof first.provisionKey === "string" ? first.provisionKey : null
    return [{ key: rule.key, title: typeof rule.title === "string" ? rule.title : rule.key, provisionKey }]
  })
}

const conflictQuestions = (questions: readonly { kind: string }[]) =>
  questions.filter((question) => question.kind === "conflict").length

/** A step's result from its output, or null for a step the page doesn't show or an output it can't read. */
function resultOf(stage: string, item: string, at: string, value: unknown): BuildResult | null {
  const id = `${stage}:${item}`
  switch (stage) {
    case "vocabulary": {
      const parsed = vocabularyOutput.safeParse(value)
      return parsed.success
        ? {
            id,
            at,
            kind: "terms",
            documentId: item,
            labels: parsed.data.terms.flatMap((term) => term.labels.slice(0, 1).map((label) => label.text)),
            isReused: parsed.data.isReused
          }
        : null
    }
    case "encode": {
      const parsed = encodeOutput.safeParse(value)
      if (!parsed.success) {
        return null
      }
      const rules = draftedRules(parsed.data.answer)
      return {
        id,
        at,
        kind: "rules",
        unitId: item,
        rules,
        isValid: unitState.shape.draft.safeParse(parsed.data.answer).success
      }
    }
    case "verify": {
      if (item === "merged") {
        const parsed = unitProblems.safeParse(value)
        return parsed.success
          ? {
              id,
              at,
              kind: "checked-together",
              unitsWithProblems: parsed.data.filter(([, problems]) => problems.length > 0).length,
              problems: parsed.data.reduce((sum, [, problems]) => sum + problems.length, 0)
            }
          : null
      }
      const parsed = unitState.safeParse(value)
      return parsed.success ? { id, at, kind: "checked", unitId: item, problems: parsed.data.problems.length } : null
    }
    case "repair": {
      const parsed = repairOutput.safeParse(value)
      const separator = item.lastIndexOf(":")
      const round = Number(item.slice(separator + 1))
      return parsed.success && separator > 0 && Number.isInteger(round)
        ? {
            id,
            at,
            kind: "repaired",
            unitId: item.slice(0, separator),
            round,
            problemsLeft: parsed.data.state?.problems.length ?? null
          }
        : null
    }
    case "merge": {
      const parsed = mergeOutput.safeParse(value)
      return parsed.success ? { id, at, kind: "combined", conflicts: parsed.data.conflicts.length } : null
    }
    case "consolidate": {
      const parsed = consolidateOutput.safeParse(value)
      return parsed.success
        ? {
            id,
            at,
            kind: "consolidated",
            problems: parsed.data.problems.length,
            conflicts: conflictQuestions(parsed.data.rulebook.questions)
          }
        : null
    }
    default:
      return null
  }
}

/** Stages whose outputs the page shows. */
const shownStages = new Set(["vocabulary", "encode", "verify", "repair", "merge", "consolidate"])

export type BuildResultsPage = {
  /** The results written at or after the cursor, oldest first; the page drops ones it already has by id. */
  results: BuildResult[]
  /** Pass back to get only what's newer. */
  cursor: string | null
}

/**
 * The results of a build's steps written at or after `since` (an ISO time), from the outputs under `prefix`
 * (`hoas/{hoaId}/jobs/{jobId}/`). Lists every output, then reads only the new ones.
 */
export async function buildResultsSince(
  bucket: ResultsBucket,
  prefix: string,
  since: string | null
): Promise<BuildResultsPage> {
  const listed: { key: string; uploaded: Date }[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list(cursor === undefined ? { prefix } : { prefix, cursor })
    listed.push(...page.objects)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)

  const after = since === null ? -Infinity : Date.parse(since)
  const fresh = listed
    .flatMap((object) => {
      const [stage = "", ...rest] = object.key
        .slice(prefix.length)
        .replace(/\.json$/, "")
        .split("/")
      const item = rest.join("/")
      return shownStages.has(stage) && object.uploaded.getTime() >= after ? [{ ...object, stage, item }] : []
    })
    .toSorted((a, b) => a.uploaded.getTime() - b.uploaded.getTime() || a.key.localeCompare(b.key))

  const results = await Promise.all(
    fresh.map(async (object) => {
      const stored = await bucket.get(object.key)
      if (!stored) {
        return null
      }
      try {
        return resultOf(object.stage, object.item, object.uploaded.toISOString(), JSON.parse(await stored.text()))
      } catch {
        return null
      }
    })
  )
  const newest = listed.reduce<Date | null>(
    (latest, object) => (!latest || object.uploaded > latest ? object.uploaded : latest),
    null
  )
  return {
    results: results.filter((result) => result !== null),
    cursor: newest ? newest.toISOString() : since
  }
}
