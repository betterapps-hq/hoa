import { z } from "zod"
import {
  consolidateOutput,
  definedTermsOutput,
  findingCheckOutput,
  groupVocabularyOutput,
  mergeOutput,
  structureCheckOutput,
  structureRulesOutput
} from "@/encoding/stepOutputs"

// A running build's results so far (encoding.md, UX, Counts as they arrive): what each finished step produced, read
// from the step outputs the build writes to storage, newest since a cursor. Nothing here is reviewable: review happens
// in the draft. The page polls this every few seconds.

/**
 * A rule as a result lists it: its key, a title (an outline's summary until it's structured) and its main citation,
 * and once it's drafted, its statement with term links.
 */
type RuleLine = { key: string; title: string; provisionKey: string | null; statement?: string }

/** A provision as E answered it: the settings it flags, and why it holds no rule when E gave a reason. */
type ProvisionLine = { key: string; settings: string[]; noRule: string | null }

/** One step's result, as the page shows it. `at` is when the step's output was written. */
export type BuildResult = { id: string; at: string } & (
  | { kind: "terms"; documentKey: string; labels: string[] }
  | {
      kind: "outlines"
      unitId: string
      rules: RuleLine[]
      /** Every provision of the section, in E's order, rules or not. */
      provisions: ProvisionLine[]
      /** A second look at a section with its problems. */
      isRerun: boolean
    }
  | { kind: "checked-together"; unitsWithProblems: number; problems: number }
  | { kind: "vocabulary"; unitId: string; labels: string[] }
  | {
      kind: "rules"
      batchId: string
      rules: RuleLine[]
      /** 0 for the first pass, else the retry round of the rules that still had problems. */
      round: number
    }
  | { kind: "rules-checked"; round: number; rulesWithProblems: number }
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

/**
 * E's answer read leniently, for each provision of a section: the rules it outlines, the settings it flags and its
 * reason for no rule. Whatever else its format holds is left aside.
 */
const foundRules = z.object({
  answer: z
    .object({
      provisions: z.array(
        z.object({
          key: z.string(),
          outlines: z.array(z.object({ aspect: z.string(), summary: z.string() })),
          settings: z.array(z.object({ summary: z.string() })).catch([]),
          noRule: z.object({ reason: z.string() }).nullable().catch(null)
        })
      )
    })
    .nullable()
})

const conflictQuestions = (questions: readonly { kind: string }[]) =>
  questions.filter((question) => question.kind === "conflict").length

const preferredLabels = (terms: readonly { labels: readonly { text: string }[] }[]) =>
  terms.flatMap((term) => term.labels.slice(0, 1).map((label) => label.text))

/** A rule's main citation from its draft, read leniently: a draft that failed Zod still shows what it has. */
function mainCitation(draft: Record<string, unknown>) {
  const [first] = Array.isArray(draft.citations) ? draft.citations : []
  return typeof first === "object" &&
    first !== null &&
    "provisionKey" in first &&
    typeof first.provisionKey === "string"
    ? first.provisionKey
    : null
}

/** The item without a suffix the build adds to a rerun or a retry, and what the suffix says. */
function suffixed(item: string, pattern: RegExp) {
  const match = pattern.exec(item)
  return match ? { base: item.slice(0, match.index), value: match[1] ?? "" } : { base: item, value: null }
}

/** A step's result from its output, or null for a step the page doesn't show or an output it can't read. */
function resultOf(stage: string, item: string, at: string, value: unknown): BuildResult | null {
  const id = `${stage}:${item}`
  switch (stage) {
    case "defined-terms": {
      const parsed = definedTermsOutput.safeParse(value)
      return parsed.success
        ? { id, at, kind: "terms", documentKey: item, labels: preferredLabels(parsed.data.terms ?? []) }
        : null
    }
    case "find-rules": {
      if (item === "check") {
        const parsed = findingCheckOutput.safeParse(value)
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
      const parsed = foundRules.safeParse(value)
      if (item === "resolve" || !parsed.success) {
        return null
      }
      const { base, value: rerun } = suffixed(item, /:(rerun)$/)
      const answered = parsed.data.answer?.provisions ?? []
      const rules = answered.flatMap((provision) =>
        provision.outlines.map((outline) => ({
          key: `${provision.key}#${outline.aspect}`,
          title: outline.summary,
          provisionKey: provision.key
        }))
      )
      const provisions = answered.map((provision) => ({
        key: provision.key,
        settings: provision.settings.map((setting) => setting.summary),
        noRule: provision.noRule?.reason ?? null
      }))
      return { id, at, kind: "outlines", unitId: base, rules, provisions, isRerun: rerun !== null }
    }
    case "vocabulary": {
      const parsed = groupVocabularyOutput.safeParse(value)
      if (item === "check" || !parsed.success) {
        return null
      }
      const { base } = suffixed(item, /:(rerun)$/)
      return { id, at, kind: "vocabulary", unitId: base, labels: preferredLabels(parsed.data.group?.terms ?? []) }
    }
    case "structure-rules": {
      const check = suffixed(item, /^check:(\d+)$/)
      if (check.value !== null) {
        const parsed = structureCheckOutput.safeParse(value)
        return parsed.success
          ? {
              id,
              at,
              kind: "rules-checked",
              round: Number(check.value),
              rulesWithProblems: parsed.data.reduce((sum, batch) => sum + batch.rules.length, 0)
            }
          : null
      }
      const parsed = structureRulesOutput.safeParse(value)
      if (!parsed.success) {
        return null
      }
      const { base, value: round } = suffixed(item, /:retry-(\d+)$/)
      const rules = parsed.data.rules.map((rule) => ({
        key: rule.key,
        title: typeof rule.draft.title === "string" ? rule.draft.title : rule.key,
        provisionKey: mainCitation(rule.draft),
        ...(typeof rule.draft.statement === "string" ? { statement: rule.draft.statement } : {})
      }))
      return { id, at, kind: "rules", batchId: base, rules, round: round === null ? 0 : Number(round) }
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
const shownStages = new Set(["defined-terms", "find-rules", "vocabulary", "structure-rules", "merge", "consolidate"])

export type BuildResultsPage = {
  /** The results written at or after the cursor, oldest first; the page drops ones it already has by id. */
  results: BuildResult[]
  /** Pass back to get only what's newer. */
  cursor: string | null
}

/**
 * The results of a build's steps written at or after `since` (an ISO time), from the outputs under `prefix`
 * (`hoas/{organizationId}/jobs/{jobId}/`). Lists every output, then reads only the new ones.
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
