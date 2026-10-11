import { z } from "zod"
import { applyConsolidation } from "@/encoding/consolidate"
import { outlineSchema } from "@/encoding/stepOutputs"
import { checkDefinedTerms, citableProvisions } from "@/encoding/steps/definedTerms"
import { proposedPropertyTerm } from "@/encoding/steps/drafts"
import {
  buildGroupVocabulary,
  checkFindings,
  checkStructured,
  consolidateRules,
  findDefinedTerms,
  findingOf,
  findingRerunProblems,
  findRules,
  freezeVocabulary,
  knownTermsOf,
  mergeVocabulary,
  resolveFindings,
  retryBatch,
  retryRecords,
  structureFirstPass,
  unresolvedProblem,
  vocabularyEntries,
  vocabularyRerunProblems,
  zodProblems,
  type FoundSection,
  type ItemProblem,
  type Structured,
  type StructuringBatch
} from "@/encoding/steps/pipeline"
import type { StepAi } from "@/encoding/steps/run"
import { checkSharedVocabulary, type GroupVocabulary } from "@/encoding/steps/vocabulary"
import { mergeExactKeys } from "@/encoding/steps/vocabularyMerge"
import type { ModelCall } from "@/jobs/steps"
import type * as T from "@/schema/types"
import { ruleDraft, termDraft, type RuleContent, type TermContent } from "@/schema/zod"
import type {
  ConsolidationItem,
  DefinedTermsItem,
  RuleFindingItem,
  RuleStructuringItem,
  SharedVocabularyItem,
  VocabularyMergeItem
} from "./datasets"
import type { ConsolidationOutput, FindingOutput, MergeOutput, StructuringOutput, VocabularyOutput } from "./scores"

// Runs one drafted step over dataset items (evaluation.md, Running one step), as the build runs it: each item's input
// becomes the step's prompt variables, the answer goes through the step's code (keys built, checks, merges), a failing
// item is rerun once with its problems (B, E and C; F retries its failing rules in up to two rounds), and the output
// takes the shape the item's expected output has, so the step's scores compare them. The per-item work is the build's own
// (src/encoding/steps/pipeline.ts). Every call is recorded; an answer that fails Zod is kept with its issues and
// counted. `cacheStage` keeps repeats apart in the content cache.

export type StepProblem = { itemId: string; code: string; message: string }

export type StepRun<Output> = {
  outputs: Map<string, Output | null>
  calls: ModelCall[]
  /** Answers that failed Zod, and what the step's code found (after the rerun, when there was one). */
  problems: StepProblem[]
  /** What the next step reads (outlines, a vocabulary, rules), for chaining. */
  handoff: Handoff
}

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

const ofItem = (itemId: string, problems: readonly ItemProblem[]): StepProblem[] =>
  problems.map(({ code, message }) => ({ itemId, code, message }))

/** B's check of an item's terms, with the provisions the item gives it as citable. */
export const definedTermsProblems = (item: DefinedTermsItem, terms: readonly TermContent[]) =>
  checkDefinedTerms(terms, citableProvisions(item.input.definitions, item.input.candidates))

export async function runDefinedTerms(
  items: readonly DefinedTermsItem[],
  context: Context
): Promise<StepRun<VocabularyOutput>> {
  const found = new Map<string, Awaited<ReturnType<typeof findDefinedTerms>>>()
  // Documents are independent, so their calls run in parallel, each with its own reruns.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    found.set(
      item.id,
      await findDefinedTerms({
        ai: context.ai,
        cacheStage: context.cacheStage,
        itemId: item.id,
        input: item.input,
        reruns: context.reruns ?? 0
      })
    )
  })
  const results = items.flatMap((item) => {
    const result = found.get(item.id)
    return result ? [{ item, result }] : []
  })
  return {
    outputs: new Map(results.map(({ item, result }) => [item.id, result.terms ? { terms: result.terms } : null])),
    calls: results.flatMap(({ result }) => result.calls),
    problems: results.flatMap(({ item, result }) => ofItem(item.id, result.problems)),
    handoff: { definedTerms: results.flatMap(({ result }) => result.terms ?? []) }
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
  const answered = new Map<string, FoundSection>()
  const failed = new Map<string, ItemProblem[]>()
  // A rerun that fails Zod keeps the section's first answer, as the build does.
  const run = async (item: RuleFindingItem, problemsBlock?: string) => {
    const result = await findRules({
      ai: context.ai,
      cacheStage: context.cacheStage,
      itemId: item.id,
      input: item.input,
      definedTerms: context.definedTerms,
      problems: problemsBlock
    })
    calls.push(result.call)
    if (result.answer) {
      answered.set(item.id, {
        itemId: item.id,
        unit: item.input.unit,
        finding: findingOf(result.answer, item.input.unit, context.definedTerms)
      })
      failed.delete(item.id)
    } else {
      failed.set(item.id, result.problems)
    }
  }
  const sections = () => items.flatMap((item) => answered.get(item.id) ?? [])
  // Sections are independent, so their calls run in parallel, as the build runs them; the check across sections waits
  // for every first answer, then the failing sections rerun in parallel.
  await inParallel(items, context.concurrency ?? 8, (item) => run(item))
  if ((context.reruns ?? 0) > 0) {
    const checked = checkFindings(sections(), context.provisions)
    const due = items.filter((item) => !answered.has(item.id) || (checked.get(item.id) ?? []).length > 0)
    await inParallel(due, context.concurrency ?? 8, (item) =>
      run(
        item,
        findingRerunProblems(answered.has(item.id) ? (checked.get(item.id) ?? []) : null, failed.get(item.id) ?? [])
      )
    )
  }
  const resolved = resolveFindings(sections(), context.provisions)
  const outputs = new Map<string, FindingOutput | null>(items.map((item) => [item.id, null]))
  for (const section of resolved.sections) {
    outputs.set(section.itemId, { provisions: section.provisions })
  }
  return {
    outputs,
    calls,
    problems: [
      ...[...failed].flatMap(([itemId, problems]) => ofItem(itemId, problems)),
      ...resolved.sections.flatMap((section) => ofItem(section.itemId, section.problems)),
      ...resolved.unresolved.map(unresolvedProblem)
    ],
    handoff: { outlines: resolved.outlines, unresolved: resolved.unresolved, settingsFlags: resolved.settingsFlags }
  }
}

export async function runSharedVocabulary(
  items: readonly SharedVocabularyItem[],
  context: Context
): Promise<StepRun<VocabularyOutput>> {
  const calls: ModelCall[] = []
  const groups = new Map<string, GroupVocabulary>()
  const failed = new Map<string, ItemProblem[]>()
  const known = items[0] ? knownTermsOf(items[0].input) : []
  // A rerun that fails Zod keeps the group's first answer, as the build does.
  const run = async (item: SharedVocabularyItem, problemsBlock?: string) => {
    const result = await buildGroupVocabulary({
      ai: context.ai,
      cacheStage: context.cacheStage,
      itemId: item.id,
      input: item.input,
      problems: problemsBlock
    })
    calls.push(result.call)
    if (result.group) {
      groups.set(item.id, result.group)
      failed.delete(item.id)
    } else {
      failed.set(item.id, result.problems)
    }
  }
  const ordered = () => items.flatMap((item) => groups.get(item.id) ?? [])
  // Groups are independent, so their calls run in parallel, as the build runs them; the check across groups waits for
  // every first answer, then the failing groups rerun in parallel.
  await inParallel(items, context.concurrency ?? 8, (item) => run(item))
  if ((context.reruns ?? 0) > 0) {
    const checked = checkSharedVocabulary(ordered(), known)
    const due = items.filter((item) => failed.has(item.id) || (checked.get(item.id) ?? []).length > 0)
    await inParallel(due, context.concurrency ?? 8, (item) =>
      run(item, vocabularyRerunProblems(checked.get(item.id) ?? [], failed.get(item.id) ?? []))
    )
  }
  const problems = [
    ...[...failed].flatMap(([itemId, found]) => ofItem(itemId, found)),
    ...[...checkSharedVocabulary(ordered(), known)].flatMap(([itemId, found]) => ofItem(itemId, found))
  ]
  const merged = items[0] ? vocabularyEntries(items[0].input, ordered()) : []
  return {
    outputs: new Map(items.map((item) => [item.id, groups.get(item.id) ?? null])),
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
    const merged = await mergeVocabulary({ ai: context.ai, cacheStage: context.cacheStage, itemId: item.id, entries })
    if (merged) {
      calls.push(merged.call)
      problems.push(...ofItem(item.id, merged.problems))
    }
    // An answer that fails Zod merges nothing, as in the build.
    const frozen = freezeVocabulary(entries, merged?.answer ?? null)
    problems.push(...ofItem(item.id, frozen.problems))
    outputs.set(
      item.id,
      merged && !merged.answer
        ? null
        : {
            merges: frozen.merges,
            renames: frozen.renames.map(({ key, origin: from }) => ({ key, origin: from }))
          }
    )
    handoff = { terms: frozen.terms, serves: Object.fromEntries(frozen.serves) }
  }
  return { outputs, calls, problems, handoff }
}

const evaluationDate = () => "2000-01-01"

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
  const done = new Map<string, { batch: StructuringBatch; structured: Structured[]; proposed: TermContent[] }>()
  const call = { ai: context.ai, cacheStage: context.cacheStage, effectiveFrom: evaluationDate }
  // Batches are independent, so their calls run in parallel, as the build runs them; each round of retries waits for
  // the round before, since a rule's check reads every rule of the run.
  await inParallel(items, context.concurrency ?? 8, async (item) => {
    const batch: StructuringBatch = { ...item.input, id: item.id }
    const first = await structureFirstPass({ ...call, batch, reruns: context.retries > 0 ? 1 : 0 })
    calls.push(...first.calls)
    problems.push(...ofItem(item.id, first.issues))
    const proposed = (first.answer?.proposedTerms ?? []).map(proposedPropertyTerm)
    done.set(item.id, { batch, structured: first.structured, proposed })
  })
  /** The batches done, in the items' order whatever order their calls finished in. */
  const entries = () =>
    items.flatMap((item) => {
      const entry = done.get(item.id)
      return entry ? [{ itemId: item.id, entry }] : []
    })
  const vocabularyOf = (entry: { batch: StructuringBatch; proposed: TermContent[] }) => [
    ...entry.batch.vocabulary,
    ...entry.proposed
  ]
  const allStructured = () => entries().flatMap(({ entry }) => entry.structured)
  const check = (entry: { batch: StructuringBatch; proposed: TermContent[] }) =>
    checkStructured({
      structured: allStructured(),
      vocabulary: vocabularyOf(entry),
      provisions: context.provisions,
      documents: context.documents,
      otherRules: context.otherRules
    })
  for (let round = 1; round <= Math.min(context.retries, 2); round += 1) {
    const checked = new Map(entries().map(({ itemId, entry }) => [itemId, check(entry)]))
    await inParallel(entries(), context.concurrency ?? 8, async ({ itemId, entry }) => {
      const found = checked.get(itemId)
      if (!found) {
        return
      }
      const records = retryRecords(entry.structured, (key) => found.get(key) ?? [])
      if (records.length === 0) {
        return
      }
      const retry = await retryBatch({ ...call, batch: entry.batch }, records, round)
      calls.push(retry.call)
      problems.push(...ofItem(`${itemId}:retry-${round}`, retry.issues))
      const replaced = new Map(retry.structured.map((item) => [item.outline.key, item]))
      entry.structured = entry.structured.map((item) => replaced.get(item.outline.key) ?? item)
      entry.proposed.push(...(retry.answer?.proposedTerms ?? []).map(proposedPropertyTerm))
    })
  }
  const outputs = new Map<string, StructuringOutput | null>()
  for (const { itemId, entry } of entries()) {
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
      terms: [
        ...new Map(
          entries()
            .flatMap(({ entry }) => vocabularyOf(entry))
            .map((term) => [term.key, term])
        ).values()
      ]
    }
  }
}

export async function runConsolidation(
  items: readonly ConsolidationItem[],
  context: Context
): Promise<StepRun<ConsolidationOutput>> {
  const calls: ModelCall[] = []
  const problems: StepProblem[] = []
  const outputs = new Map<string, ConsolidationOutput | null>()
  for (const item of items) {
    const result = await consolidateRules({
      ai: context.ai,
      cacheStage: context.cacheStage,
      itemId: item.id,
      input: item.input
    })
    calls.push(result.call)
    if (!result.isValid) {
      problems.push(...ofItem(item.id, zodProblems(result.issues)))
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
    problems.push(...ofItem(item.id, applied.problems))
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
