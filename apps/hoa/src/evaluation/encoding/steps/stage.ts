import { z } from "zod"
import { applyConsolidation } from "@/encoding/consolidate"
import { recordProblems } from "@/encoding/steps/check"
import { consolidationAnswer, consolidationVariables } from "@/encoding/steps/consolidation"
import {
  checkDefinedTerms,
  citableProvisions,
  definedTermsAnswer,
  definedTermsOf,
  definedTermsVariables
} from "@/encoding/steps/definedTerms"
import { proposedPropertyTerm } from "@/encoding/steps/drafts"
import { resolveOutlines, type Outline } from "@/encoding/steps/outline"
import {
  checkFinding,
  findingKeys,
  keyedOutline,
  outlinesOf,
  reasonsOf,
  ruleFindingAnswer,
  ruleFindingVariables,
  settingsFlagsOf,
  withHeadingReasons,
  type RuleFindingAnswer
} from "@/encoding/steps/ruleFinding"
import { outlineOfRecord, retryBatches, retryProblemsText, type ProblemRecord } from "@/encoding/steps/ruleRetry"
import {
  draftsOf,
  parseDrafts,
  ruleStructuringAnswer,
  ruleStructuringVariables,
  type RuleStructuringAnswer
} from "@/encoding/steps/ruleStructuring"
import { runStepPrompt, type StepAi } from "@/encoding/steps/run"
import {
  checkSharedVocabulary,
  sharedVocabularyAnswer,
  sharedVocabularyTerms,
  sharedVocabularyVariables,
  type GroupVocabulary
} from "@/encoding/steps/vocabulary"
import {
  applyVocabularyMerge,
  mergeClusters,
  mergeExactKeys,
  vocabularyMergeAnswer,
  vocabularyMergeVariables,
  type VocabularyEntry
} from "@/encoding/steps/vocabularyMerge"
import type { ModelCall } from "@/jobs/steps"
import type * as T from "@/schema/types"
import { domain, ruleDraft, ruleSelection, termDraft, type RuleContent, type TermContent } from "@/schema/zod"
import type {
  ConsolidationItem,
  DefinedTermsItem,
  RuleFindingItem,
  RuleStructuringItem,
  SharedVocabularyItem,
  VocabularyMergeItem
} from "./datasets"
import { retryOutcome, type RetryItem } from "./oldRuns"
import type {
  ConsolidationOutput,
  FindingOutput,
  MergeOutput,
  RetryOutput,
  StructuringOutput,
  VocabularyOutput
} from "./scores"

// Runs one drafted step over dataset items (evaluation.md, Running one step), as the reordered pipeline would: each
// item's input becomes the step's prompt variables, the answer goes through the step's code (keys built, checks,
// merges), a failing item is rerun once with its problems (B, E and C; F's retry is its own mode), and the output
// takes the shape the item's expected output has, so the step's scores compare them. Every call is recorded; an answer
// that fails Zod is kept with its issues and counted. `cacheStage` keeps repeats apart in the content cache.

export type StepProblem = { itemId: string; code: string; message: string }

export type StepRun<Output> = {
  outputs: Map<string, Output | null>
  calls: ModelCall[]
  /** Answers that failed Zod, and what the step's code found (after the rerun, when there was one). */
  problems: StepProblem[]
  /** What the next step reads (outlines, a vocabulary, rules), for chaining. */
  handoff: Handoff
}

const outlineTargets = z.object({
  rules: z.array(z.string()),
  provisions: z.array(z.string()),
  documents: z.array(z.string())
})

/** An outline as a step run stores it. */
export const outlineSchema: z.ZodType<Outline> = z.object({
  key: z.string(),
  provisionKey: z.string(),
  unitId: z.string(),
  summary: z.string(),
  domain,
  citations: z.array(z.string()),
  interpretation: z.boolean(),
  reads: z.array(z.object({ about: z.string(), fact: z.string() })),
  readKeys: z.array(z.string()),
  kind: z.enum(["norm", "discretion", "sanction", "limit"]),
  modality: z.string().nullable(),
  bearer: z.string().nullable(),
  appliesTo: z.string().nullable(),
  requestTypes: z.array(z.string()),
  check: z.enum(["test", "table", "document", "deadline", "approval", "judgment"]).nullable(),
  decidedBy: z.string().nullable(),
  targets: outlineTargets.nullable(),
  except: outlineTargets.nullable(),
  sanction: z.object({ type: z.string(), imposedBy: z.string(), against: z.array(z.string()) }).nullable(),
  resolved: z
    .object({ rules: z.array(z.string()), documents: z.array(z.string()), except: z.array(z.string()) })
    .nullable(),
  selector: ruleSelection.options[1].nullable()
})

const origin = z.union([
  z.enum(["core", "defined", "previous", "frozen", "proposed"]),
  z.templateLiteral(["group ", z.number()])
])

/**
 * What a step run hands the next step (handoff.json in its folder): each step adds its part to what it was handed, so
 * F reads E's outlines and flags with C-merge's frozen vocabulary.
 */
export const handoff = z.object({
  outlines: z.array(outlineSchema).optional(),
  unresolved: z.array(z.object({ key: z.string(), target: z.string() })).optional(),
  settingsFlags: z.array(z.object({ provisionKey: z.string(), clause: z.string(), summary: z.string() })).optional(),
  definedTerms: z.array(termDraft).optional(),
  /** C's terms before C-merge, by group, with what each serves. */
  entries: z.array(z.object({ term: termDraft, serves: z.array(z.string()), origin })).optional(),
  /** The frozen vocabulary and what each term serves. */
  terms: z.array(termDraft).optional(),
  serves: z.record(z.string(), z.array(z.string())).optional(),
  rules: z.array(ruleDraft).optional()
})
export type Handoff = z.input<typeof handoff>

type Context = {
  ai: StepAi
  cacheStage: string
  /** Reruns of a failing item, with its problems (0 or 1). */ reruns?: number
  /** Calls in flight at once for steps whose items are independent (default 8). */
  concurrency?: number
}

/** Runs `work` over the items with at most `limit` in flight; a failure stops it as a sequential loop would. */
async function inParallel<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

const zodProblems = (itemId: string, issues: readonly { message: string; path: PropertyKey[] }[]) =>
  issues.slice(0, 20).map((issue) => ({ itemId, code: "zod", message: `${issue.path.join(".")}: ${issue.message}` }))

/** The `<problems>` block of a rerun: one problem per line, `record: path: message [code]`. */
const problemsText = (problems: readonly { recordKey: string; code: string; message: string; path?: unknown[] }[]) =>
  problems
    .map(
      (problem) =>
        `${problem.recordKey}: ${(problem.path ?? []).join(".") || "-"}: ${problem.message} [${problem.code}]`
    )
    .join("\n")

/** B's check of an item's terms, with the provisions the item gives it as citable. */
export const definedTermsProblems = (item: DefinedTermsItem, terms: readonly TermContent[]) =>
  checkDefinedTerms(terms, citableProvisions(item.input.definitions, item.input.candidates))

export async function runDefinedTerms(
  items: readonly DefinedTermsItem[],
  context: Context
): Promise<StepRun<VocabularyOutput>> {
  const outputs = new Map<string, VocabularyOutput | null>()
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  // Documents are independent, so their calls run in parallel, each with its own reruns.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    let problemsBlock: string | undefined
    for (let attempt = 0; attempt <= (context.reruns ?? 0); attempt += 1) {
      const result = await runStepPrompt({
        ...context,
        step: "definedTerms",
        itemId: item.id,
        schema: definedTermsAnswer,
        variables: definedTermsVariables({ ...item.input, problems: problemsBlock })
      })
      calls.push(result.call)
      if (!result.isValid) {
        outputs.set(item.id, null)
        problemsBlock = problemsText(
          result.issues.map((issue) => ({ recordKey: "answer", code: "zod", message: issue.message, path: issue.path }))
        )
        if (attempt === (context.reruns ?? 0)) {
          problems.push(...zodProblems(item.id, result.issues))
        }
        continue
      }
      const { terms, problems: built } = definedTermsOf(result.object)
      const check = [...built, ...definedTermsProblems(item, terms)]
      outputs.set(item.id, { terms })
      if (check.length === 0 || attempt === (context.reruns ?? 0)) {
        problems.push(...check.map((problem) => ({ itemId: item.id, code: problem.code, message: problem.message })))
        break
      }
      problemsBlock = problemsText(check)
    }
  })
  return {
    outputs,
    calls,
    problems,
    handoff: { definedTerms: [...outputs.values()].flatMap((output) => output?.terms ?? []) }
  }
}

export async function runRuleFinding(
  items: readonly RuleFindingItem[],
  context: Context & {
    /** B's terms, which subjects and parties given as labels resolve against. */
    definedTerms: readonly TermContent[]
    provisions: readonly T.Provision[]
  }
): Promise<StepRun<FindingOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const found = new Map<string, { item: RuleFindingItem; answer: RuleFindingAnswer; outlines: Outline[] }>()
  const run = async (item: RuleFindingItem, problemsBlock?: string) => {
    const schema = ruleFindingAnswer(findingKeys(item.input.knownTerms))
    const result = await runStepPrompt({
      ...context,
      step: "ruleFinding",
      itemId: item.id,
      schema,
      variables: ruleFindingVariables({ ...item.input, problems: problemsBlock })
    })
    calls.push(result.call)
    if (!result.isValid) {
      return { issues: zodProblems(item.id, result.issues) }
    }
    const answer = withHeadingReasons(result.object, item.input.unit.provisions)
    const outlines = outlinesOf(answer, item.input.unit.id).map((outline) =>
      keyedOutline(outline, context.definedTerms)
    )
    found.set(item.id, { item, answer, outlines })
    return { issues: [] }
  }
  const check = (entry: { item: RuleFindingItem; answer: RuleFindingAnswer }) =>
    checkFinding({
      answer: entry.answer,
      unitProvisions: entry.item.input.unit.provisions.map((provision) => provision.key),
      provisions: context.provisions,
      outlines: [...found.values()].flatMap((value) => value.outlines)
    }).filter((problem) => problem.code !== "no-reads")
  const failed = new Map<string, StepProblem[]>()
  // Sections are independent, so their calls run in parallel, as the build runs them.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    const { issues } = await run(item)
    if (issues.length > 0) {
      failed.set(item.id, issues)
    }
  })
  if ((context.reruns ?? 0) > 0) {
    for (const item of items) {
      const entry = found.get(item.id)
      const issues = entry ? check(entry) : null
      if (issues === null || issues.length > 0) {
        const block = issues
          ? problemsText(
              issues.map((problem) => ({
                recordKey: problem.provisionKey,
                code: problem.code,
                message: problem.message
              }))
            )
          : problemsText(
              (failed.get(item.id) ?? []).map((problem) => ({
                recordKey: "answer",
                code: problem.code,
                message: problem.message
              }))
            )
        failed.delete(item.id)
        const rerun = await run(item, block)
        if (rerun.issues.length > 0) {
          failed.set(item.id, rerun.issues)
        }
      }
    }
  }
  for (const issues of failed.values()) {
    problems.push(...issues)
  }
  const all = [...found.values()].flatMap((entry) => entry.outlines)
  const resolved = resolveOutlines(all, context.provisions)
  const outputs = new Map<string, FindingOutput | null>(items.map((item) => [item.id, null]))
  for (const entry of found.values()) {
    const { item, answer, outlines } = entry
    problems.push(
      ...checkFinding({
        answer,
        unitProvisions: item.input.unit.provisions.map((provision) => provision.key),
        provisions: context.provisions,
        outlines: all
      }).map((problem) => ({ itemId: item.id, code: problem.code, message: problem.message }))
    )
    const own = new Set(outlines.map((outline) => outline.key))
    const keyed = resolved.outlines.filter((outline) => own.has(outline.key))
    const reasons = reasonsOf(answer, all)
    outputs.set(item.id, {
      provisions: answer.provisions.map((provision) => ({
        key: provision.key,
        noRule: reasons.get(provision.key) ?? null,
        outlines: keyed.filter((outline) => outline.provisionKey === provision.key)
      }))
    })
  }
  problems.push(
    ...resolved.unresolved.map((target) => ({
      itemId: target.key,
      code: "unresolved-target",
      message: `${target.target} resolves to no rule (consolidation's cross-references)`
    }))
  )
  return {
    outputs,
    calls,
    problems,
    handoff: {
      outlines: resolved.outlines,
      unresolved: resolved.unresolved,
      settingsFlags: [...found.values()].flatMap((entry) => settingsFlagsOf(entry.answer))
    }
  }
}

export async function runSharedVocabulary(
  items: readonly SharedVocabularyItem[],
  context: Context
): Promise<StepRun<VocabularyOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const groups = new Map<string, GroupVocabulary>()
  const known = items[0] ? [...items[0].input.definedTerms, ...items[0].input.previous] : []
  const run = async (item: SharedVocabularyItem, problemsBlock?: string) => {
    const result = await runStepPrompt({
      ...context,
      step: "sharedVocabulary",
      itemId: item.id,
      schema: sharedVocabularyAnswer,
      variables: sharedVocabularyVariables({ ...item.input, problems: problemsBlock })
    })
    calls.push(result.call)
    if (!result.isValid) {
      groups.delete(item.id)
      return zodProblems(item.id, result.issues)
    }
    groups.set(item.id, {
      groupId: item.id,
      outlines: item.input.outlines,
      ...sharedVocabularyTerms(result.object, known)
    })
    return []
  }
  const zodFailures = new Map<string, StepProblem[]>()
  // Groups are independent, so their calls run in parallel, as the build runs them; the check across groups waits for
  // every first answer, then the failing groups rerun in parallel.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    zodFailures.set(item.id, await run(item))
  })
  if ((context.reruns ?? 0) > 0) {
    const checked = checkSharedVocabulary([...groups.values()], known)
    await inParallel(items, context.concurrency ?? 8, async (item) => {
      const found = checked.get(item.id) ?? []
      const failures = zodFailures.get(item.id) ?? []
      if (found.length > 0 || failures.length > 0) {
        const block = problemsText(
          found.length > 0
            ? found
            : failures.map((problem) => ({ recordKey: "answer", code: problem.code, message: problem.message }))
        )
        zodFailures.set(item.id, await run(item, block))
      }
    })
  }
  for (const failures of zodFailures.values()) {
    problems.push(...failures)
  }
  for (const [itemId, found] of checkSharedVocabulary([...groups.values()], known)) {
    problems.push(...found.map((problem) => ({ itemId, code: problem.code, message: problem.message })))
  }
  const outputs = new Map<string, VocabularyOutput | null>(items.map((item) => [item.id, groups.get(item.id) ?? null]))
  const entries: VocabularyEntry[] = [
    ...(items[0]?.input.definedTerms ?? []).map((term) => ({ term, serves: [], origin: "defined" as const })),
    ...(items[0]?.input.previous ?? []).map((term) => ({ term, serves: [], origin: "previous" as const })),
    ...[...groups.values()].flatMap((group, index) =>
      group.terms.map((term) => ({
        term,
        serves: group.serves.get(term.key) ?? [],
        origin: `group ${index + 1}` as const
      }))
    )
  ]
  const merged = mergeExactKeys(entries)
  return {
    outputs,
    calls,
    problems,
    handoff: {
      entries: merged,
      terms: merged.map((entry) => entry.term),
      serves: Object.fromEntries(merged.map((entry) => [entry.term.key, entry.serves]))
    }
  }
}

export async function runVocabularyMerge(
  items: readonly VocabularyMergeItem[],
  context: Context
): Promise<StepRun<MergeOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const outputs = new Map<string, MergeOutput | null>()
  let handoff: Handoff = {}
  for (const item of items) {
    // Exact keys merge again first, so what C handed over is merged by the current rules.
    const entries = mergeExactKeys(item.input.entries)
    const clusters = mergeClusters(entries)
    if (clusters.length === 0) {
      outputs.set(item.id, { merges: [], renames: [] })
      handoff = { terms: entries.map((entry) => entry.term) }
      continue
    }
    const { variables, ids } = vocabularyMergeVariables(entries, clusters)
    const result = await runStepPrompt({
      ...context,
      step: "vocabularyMerge",
      itemId: item.id,
      schema: vocabularyMergeAnswer,
      variables
    })
    calls.push(result.call)
    if (!result.isValid) {
      problems.push(...zodProblems(item.id, result.issues))
      outputs.set(item.id, null)
      continue
    }
    const applied = applyVocabularyMerge({ entries, ids, answer: result.object })
    problems.push(
      ...applied.problems.map((problem) => ({ itemId: item.id, code: problem.code, message: problem.message }))
    )
    outputs.set(item.id, {
      merges: applied.merges,
      renames: applied.renames.map(({ key, origin: from }) => ({ key, origin: from }))
    })
    handoff = { terms: applied.terms, serves: Object.fromEntries(applied.serves) }
  }
  return { outputs, calls, problems, handoff }
}

type Batch = {
  id: string
  outlines: Outline[]
  related: Outline[]
  vocabulary: TermContent[]
  documents: RuleStructuringItem["input"]["documents"]
  provisions: T.Provision[]
  settingsFlags: RuleStructuringItem["input"]["settingsFlags"]
}

type Structured = { outline: Outline; draft: Record<string, unknown>; rule: RuleContent | null; issues: string[] }

/** One F call over a batch (a first pass, or a retry with the failing rules as problems). */
async function structureBatch(batch: Batch, context: Context, problemsBlock?: string) {
  const result = await runStepPrompt({
    ...context,
    step: "ruleStructuring",
    itemId: batch.id,
    schema: ruleStructuringAnswer,
    variables: ruleStructuringVariables({ ...batch, problems: problemsBlock })
  })
  if (!result.isValid) {
    return { call: result.call, answer: null, issues: zodProblems(batch.id, result.issues), structured: [] }
  }
  const answer: RuleStructuringAnswer = result.object
  const merged = draftsOf({ outlines: batch.outlines, rules: answer.rules, effectiveFrom: () => "2000-01-01" })
  const parsed = parseDrafts(merged.drafts)
  const structured: Structured[] = merged.drafts.map(({ outline, draft }, index) => ({
    outline,
    draft,
    rule: parsed[index]?.rule ?? null,
    issues: [
      ...(parsed[index]?.issues ?? []).map((issue) => `zod: ${issue.path.join(".")}: ${issue.message}`),
      ...merged.problems
        .filter((problem) => problem.key === outline.key)
        .map((problem) => `${problem.code}: ${problem.message}`)
    ]
  }))
  return {
    call: result.call,
    answer,
    issues: [
      ...merged.problems.map((problem) => ({ itemId: batch.id, code: problem.code, message: problem.message })),
      ...answer.outlineIssues.map((issue) => ({
        itemId: batch.id,
        code: "outline-issue",
        message: `${issue.provision}: ${issue.issue}`
      })),
      ...answer.unfixable.map((item) => ({ itemId: batch.id, code: "unfixable", message: `${item.key}: ${item.note}` }))
    ],
    structured
  }
}

/**
 * The validator's problems with each structured rule, read with the batch's vocabulary, every rule of the run and the
 * context's other rules (those of batches outside a partial run, which a rule may target).
 */
function checkStructured(
  structured: readonly Structured[],
  vocabulary: readonly TermContent[],
  provisions: readonly T.Provision[],
  documents: readonly T.GoverningDocument[],
  otherRules: readonly RuleContent[] = []
) {
  const own = structured.flatMap((item) => (item.rule ? [item.rule] : []))
  const keys = new Set(structured.map((item) => item.outline.key))
  const rules = [...own, ...otherRules.filter((rule) => !keys.has(rule.key))]
  const found = recordProblems({ terms: vocabulary, rules, provisions, documents })
  return new Map(
    structured.map((item) => [
      item.outline.key,
      [
        ...item.issues.map((issue) => ({ code: issue.split(":")[0] ?? "zod", message: issue, path: [] })),
        ...found
          .filter((problem) => problem.recordKey === item.outline.key)
          .map((problem) => ({ code: problem.code, message: problem.message, path: problem.path }))
      ]
    ])
  )
}

export async function runRuleStructuring(
  items: readonly RuleStructuringItem[],
  context: Context & {
    /** Every provision and document, for checking citations. */
    provisions: readonly T.Provision[]
    documents: readonly T.GoverningDocument[]
    /** Retries of the rules that still have problems (at most two). */
    retries: number
    /** Rules outside the run's batches that its rules may target (the golden's, for a run over part of a dataset). */
    otherRules?: readonly RuleContent[]
  }
): Promise<StepRun<StructuringOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const done = new Map<string, { batch: Batch; structured: Structured[]; proposed: TermContent[] }>()
  // Batches are independent, so their calls run in parallel, as the build runs them; each round of retries waits for
  // the round before, since a rule's check reads every rule of the run.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    const batch: Batch = { id: item.id, ...item.input }
    const first = await structureBatch(batch, context)
    calls.push(first.call)
    problems.push(...first.issues)
    const proposed = (first.answer?.proposedTerms ?? []).map(proposedPropertyTerm)
    done.set(item.id, { batch, structured: first.structured, proposed })
  })
  const vocabularyOf = (entry: { batch: Batch; proposed: TermContent[] }) => [
    ...entry.batch.vocabulary,
    ...entry.proposed
  ]
  const allStructured = () => [...done.values()].flatMap((entry) => entry.structured)
  const check = (entry: { batch: Batch; proposed: TermContent[] }) =>
    checkStructured(allStructured(), vocabularyOf(entry), context.provisions, context.documents, context.otherRules)
  for (let round = 1; round <= Math.min(context.retries, 2); round += 1) {
    const checked = new Map([...done].map(([itemId, entry]) => [itemId, check(entry)]))
    await inParallel([...done], context.concurrency ?? 8, async ([itemId, entry]) => {
      const found = checked.get(itemId)
      if (!found) {
        return
      }
      const failing = entry.structured.filter((item) => (found.get(item.outline.key) ?? []).length > 0)
      if (failing.length === 0) {
        return
      }
      const records: ProblemRecord[] = failing.map((item) => ({
        unitId: item.outline.unitId,
        key: item.outline.key,
        record: item.draft,
        problems: (found.get(item.outline.key) ?? []).map((problem) => ({
          code: problem.code,
          class: problem.code,
          message: problem.message,
          path: problem.path
        }))
      }))
      const retry = await structureBatch(
        { ...entry.batch, id: `${itemId}:retry-${round}`, outlines: failing.map((item) => item.outline) },
        context,
        retryProblemsText(records)
      )
      calls.push(retry.call)
      problems.push(...retry.issues)
      const replaced = new Map(retry.structured.map((item) => [item.outline.key, item]))
      entry.structured = entry.structured.map((item) => replaced.get(item.outline.key) ?? item)
      entry.proposed.push(...(retry.answer?.proposedTerms ?? []).map(proposedPropertyTerm))
    })
  }
  const outputs = new Map<string, StructuringOutput | null>()
  for (const [itemId, entry] of done) {
    const found = check(entry)
    outputs.set(itemId, {
      rules: entry.structured.map((item) => ({
        key: item.outline.key,
        rule: item.rule,
        raw: item.draft,
        problems: found.get(item.outline.key) ?? []
      })),
      terms: vocabularyOf(entry),
      documents: [...context.documents]
    })
  }
  return {
    outputs,
    calls,
    problems,
    handoff: {
      rules: allStructured().flatMap((item) => (item.rule ? [item.rule] : [])),
      terms: [...new Map([...done.values()].flatMap(vocabularyOf).map((term) => [term.key, term])).values()]
    }
  }
}

export async function runRuleRetry(
  items: readonly RetryItem[],
  context: Context & { documents: readonly T.GoverningDocument[] }
): Promise<StepRun<RetryOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const outputs = new Map<string, RetryOutput | null>()
  const byKey = new Map(items.map((item) => [item.input.record.key, item]))
  for (const records of retryBatches(items.map((item) => item.input.record))) {
    const [first] = records
    const firstItem = first ? byKey.get(first.key) : undefined
    if (!firstItem) {
      continue
    }
    const unique = <V extends { key: string }>(values: V[]) => [
      ...new Map(values.map((value) => [value.key, value])).values()
    ]
    const vocabulary = unique(records.flatMap((record) => byKey.get(record.key)?.input.vocabulary ?? []))
    const provisions = unique(records.flatMap((record) => byKey.get(record.key)?.input.provisions ?? []))
    const batch: Batch = {
      id: firstItem.id,
      outlines: records.map(outlineOfRecord),
      related: [],
      vocabulary,
      documents: context.documents.map(({ key, kind, title, edition }) => ({ key, kind, title, edition })),
      provisions,
      settingsFlags: []
    }
    const result = await structureBatch(batch, context, retryProblemsText(records))
    calls.push(result.call)
    problems.push(...result.issues)
    for (const record of records) {
      const item = byKey.get(record.key)
      const structured = result.structured.find((entry) => entry.outline.key === record.key)
      if (item) {
        outputs.set(
          item.id,
          structured
            ? retryOutcome({
                record,
                after: structured.draft,
                terms: vocabulary,
                rules: [],
                provisions,
                documents: context.documents
              })
            : null
        )
      }
    }
  }
  return { outputs, calls, problems, handoff: {} }
}

export async function runConsolidation(
  items: readonly ConsolidationItem[],
  context: Context
): Promise<StepRun<ConsolidationOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const outputs = new Map<string, ConsolidationOutput | null>()
  for (const item of items) {
    const result = await runStepPrompt({
      ...context,
      step: "consolidation",
      itemId: item.id,
      schema: consolidationAnswer(item.input.rules),
      variables: consolidationVariables(item.input)
    })
    calls.push(result.call)
    if (!result.isValid) {
      problems.push(...zodProblems(item.id, result.issues))
      outputs.set(item.id, null)
      continue
    }
    const applied = applyConsolidation(
      {
        organization: { id: "evaluation" },
        documents: item.input.documents.map((document) => ({ ...document, issuedBy: null, governs: null })),
        provisions: [],
        terms: item.input.terms,
        proposedCore: [],
        rules: item.input.rules,
        settings: { clauses: { precedence: { order: item.input.precedence, citations: [] } } },
        questions: []
      },
      result.object
    )
    problems.push(
      ...applied.problems.map((problem) => ({ itemId: item.id, code: problem.code, message: problem.message }))
    )
    outputs.set(item.id, {
      overrides: result.object.overrides.flatMap((entry) =>
        entry.overrides.map((target) => ({ rule: entry.rule, target }))
      ),
      invalid: applied.problems.filter(
        (problem) => problem.code === "invalid-override" || problem.code === "override-not-allowed"
      ).length
    })
  }
  return { outputs, calls, problems, handoff: {} }
}
