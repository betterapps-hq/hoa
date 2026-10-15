import type { ModelCall } from "@/jobs/steps"
import type { GoverningDocument, Provision, ProvisionKey } from "@/schema/types"
import type { EncodingDraftContent, QuestionContent, RuleContent, TermContent } from "@/schema/zod"
import { findTermCandidates, type TermCandidate } from "../definedTerms"
import type { MergedRulebook } from "../merge"
import type { EncodingUnit } from "../plan"
import { recordProblems, type StepProblem } from "./check"
import { consolidationAnswer, consolidationVariables, crossReferenceLines, exceptionLines } from "./consolidation"
import {
  checkDefinedTerms,
  citableProvisions,
  definedTermsAnswer,
  definedTermsOf,
  definedTermsVariables
} from "./definedTerms"
import { citationsOf } from "./drafts"
import { resolveOutlines, type Outline, type UnresolvedTarget } from "./outline"
import {
  checkFinding,
  findingKeys,
  keyedOutline,
  outlinesOf,
  ruleFindingAnswer,
  ruleFindingVariables,
  settingsFlagsOf,
  withHeadingReasons,
  type FindingProblem,
  type RuleFindingAnswer
} from "./ruleFinding"
import { retryProblemsText, type ProblemRecord } from "./ruleRetry"
import {
  draftsOf,
  parseDrafts,
  relatedOutlines,
  ruleStructuringAnswer,
  ruleStructuringVariables,
  structuringBatches,
  type RuleStructuringAnswer
} from "./ruleStructuring"
import { runStepPrompt, type StepAi } from "./run"
import {
  sharedVocabularyAnswer,
  sharedVocabularyTerms,
  sharedVocabularyVariables,
  type GroupVocabulary
} from "./vocabulary"
import {
  applyVocabularyMerge,
  mergeExactKeys,
  vocabularyMergeAnswer,
  vocabularyMergeVariables,
  type VocabularyEntry,
  type VocabularyMergeAnswer
} from "./vocabularyMerge"

// The reordered pipeline's work per item (implementation-plan.md, R.7 design), shared by the rulebook build and the
// step evaluations (src/evaluation/encoding/steps/stage.ts), so a chained `pnpm eval:step` makes the build's calls: each
// step's call with its answer parsed and checked, the problems a rerun or retry is given, the checks across items, and
// what each step hands the next. Neither caller's bookkeeping is here: the build runs each call as a durable step and
// the evaluations keep outputs by dataset item.

/** A problem with one item's answer; the caller knows the item. */
export type ItemProblem = { code: string; message: string }

/** What every call needs: the models, the content cache's folder, and the item the call is recorded under. */
type Call = { ai: StepAi; cacheStage: string; itemId: string }

export type DocumentLine = Pick<GoverningDocument, "key" | "kind" | "title" | "edition">

/** The first issues of an answer that fails Zod, each as `path: message`. */
export const zodProblems = (issues: readonly { message: string; path: readonly PropertyKey[] }[]): ItemProblem[] =>
  issues.slice(0, 20).map((issue) => ({ code: "zod", message: `${issue.path.join(".")}: ${issue.message}` }))

/** The `<problems>` block of a rerun: one problem per line, `record: path: message [code]`. */
export const problemsText = (
  problems: readonly { recordKey: string; code: string; message: string; path?: readonly unknown[] }[]
) =>
  problems
    .map(
      (problem) =>
        `${problem.recordKey}: ${(problem.path ?? []).join(".") || "-"}: ${problem.message} [${problem.code}]`
    )
    .join("\n")

/** The problems block of a rerun whose whole answer failed Zod. */
const answerProblemsText = (problems: readonly ItemProblem[]) =>
  problemsText(problems.map(({ code, message }) => ({ recordKey: "answer", code, message })))

// ─── B. Defined terms ───────────────────────────────────────────────────────────────────────────

export type DefinedTermsInput = { document: DocumentLine; definitions: Provision[]; candidates: TermCandidate[] }

/**
 * B's input for one document: the candidates code finds, and every provision that defines a term in full (the
 * definitions, and each provision a candidate is defined in), so a definition outside a definitions article reaches the
 * model whole, not as a one-sentence sample.
 */
export function definedTermsInput(document: DocumentLine, provisions: readonly Provision[]): DefinedTermsInput {
  const candidates = findTermCandidates(provisions)
  const defining = new Set(candidates.flatMap((candidate) => candidate.definedIn))
  const definitions = provisions.filter((provision) => provision.kind === "definition" || defining.has(provision.key))
  return { document, definitions, candidates }
}

/**
 * B over one document: the call, its terms built and checked, and up to `reruns` reruns with the problems. The terms
 * are the last answer's (none when it failed Zod), the problems what that answer still has; `found` counts the first
 * answer's.
 */
export async function findDefinedTerms(input: Call & { input: DefinedTermsInput; reruns: number }) {
  const calls: ModelCall[] = []
  let terms: TermContent[] | null = null
  let problems: ItemProblem[] = []
  let found: number | null = null
  let problemsBlock: string | undefined
  for (let attempt = 0; attempt <= input.reruns; attempt += 1) {
    const result = await runStepPrompt({
      ai: input.ai,
      cacheStage: input.cacheStage,
      step: "definedTerms",
      itemId: input.itemId,
      schema: definedTermsAnswer,
      variables: definedTermsVariables({ ...input.input, problems: problemsBlock })
    })
    calls.push(result.call)
    if (!result.isValid) {
      terms = null
      problems = zodProblems(result.issues)
      found ??= problems.length
      problemsBlock = problemsText(
        result.issues.map((issue) => ({ recordKey: "answer", code: "zod", message: issue.message, path: issue.path }))
      )
      continue
    }
    const built = definedTermsOf(result.object)
    const check = [
      ...built.problems,
      ...checkDefinedTerms(built.terms, citableProvisions(input.input.definitions, input.input.candidates))
    ]
    terms = built.terms
    problems = check.map(({ code, message }) => ({ code, message }))
    found ??= problems.length
    if (check.length === 0) {
      break
    }
    problemsBlock = problemsText(check)
  }
  return { terms, problems, found: found ?? 0, calls }
}

// ─── E. Find the rules ──────────────────────────────────────────────────────────────────────────

export type RuleFindingInput = {
  unit: EncodingUnit
  documents: DocumentLine[]
  /** Every document's definition provisions. */
  definitions: Provision[]
  /** Things, parties and categories of the previous reviewed or published rulebook. */
  knownTerms: TermContent[]
}

/** One section's answer with its outlines, their subjects and parties keyed against B's terms. */
export type Finding = { answer: RuleFindingAnswer; outlines: Outline[] }

/** E's answer format for a build: its enums are the build's parties, subjects and request types. */
export const findingAnswerOf = (knownTerms: readonly TermContent[]) => ruleFindingAnswer(findingKeys(knownTerms))

/** A section's answer as a finding: a heading-only provision left bare gets its reason, and outlines are keyed. */
export function findingOf(
  answer: RuleFindingAnswer,
  unit: Pick<EncodingUnit, "id" | "provisions">,
  definedTerms: readonly TermContent[]
): Finding {
  const withReasons = withHeadingReasons(answer, unit.provisions)
  return {
    answer: withReasons,
    outlines: outlinesOf(withReasons, unit.id).map((outline) => keyedOutline(outline, definedTerms))
  }
}

/** E over one section (a first answer, or a rerun with `problems`): the call and its answer, or why it failed Zod. */
export async function findRules(
  input: Call & { input: RuleFindingInput; definedTerms: readonly TermContent[]; problems?: string }
) {
  const result = await runStepPrompt({
    ai: input.ai,
    cacheStage: input.cacheStage,
    step: "ruleFinding",
    itemId: input.itemId,
    schema: findingAnswerOf(input.input.knownTerms),
    variables: ruleFindingVariables({ ...input.input, problems: input.problems })
  })
  return result.isValid
    ? { call: result.call, answer: result.object, problems: [] }
    : { call: result.call, answer: null, problems: zodProblems(result.issues) }
}

/** A section E answered, for the checks across sections. */
export type FoundSection = { itemId: string; unit: Pick<EncodingUnit, "id" | "provisions">; finding: Finding }

const checkSection = (section: FoundSection, provisions: readonly Provision[], outlines: readonly Outline[]) =>
  checkFinding({
    answer: section.finding.answer,
    unitProvisions: section.unit.provisions.map((provision) => provision.key),
    provisions,
    outlines
  })

/**
 * E's check across sections, after every first answer: each section's problems (an outline reading nothing is only a
 * warning, never rerun), with every section's outlines known for what cites what.
 */
export function checkFindings(sections: readonly FoundSection[], provisions: readonly Provision[]) {
  const outlines = sections.flatMap((section) => section.finding.outlines)
  return new Map(
    sections.map((section) => [
      section.itemId,
      checkSection(section, provisions, outlines).filter((problem) => problem.code !== "no-reads")
    ])
  )
}

/** The problems a section is rerun with: its check's, or, when its answer failed Zod, the answer's. */
export function findingRerunProblems(found: readonly FindingProblem[] | null, zod: readonly ItemProblem[]) {
  return found
    ? problemsText(
        found.map((problem) => ({ recordKey: problem.provisionKey, code: problem.code, message: problem.message }))
      )
    : answerProblemsText(zod)
}

/** A section's interpretation questions: one option per reading, keeping that reading's rules. */
export function interpretationQuestions(answer: RuleFindingAnswer): QuestionContent[] {
  return answer.questions.map((question) => ({
    kind: "interpretation",
    question: question.question,
    citations: citationsOf(question.provisions),
    about: { rules: [...new Set(question.readings.flatMap((reading) => reading.rules))], terms: [] },
    options: question.readings.map((reading) => ({ label: reading.label, keeps: reading.rules })),
    answer: null
  }))
}

/** What a no-rule reason's note says: the explanation, or the provision a duplicate repeats. */
function reasonNote(noRule: NonNullable<RuleFindingAnswer["provisions"][number]["noRule"]>) {
  switch (noRule.reason) {
    case "explanatory":
      return noRule.note
    case "duplicate":
      return `The same as ${noRule.of}.`
    default:
      return null
  }
}

/**
 * A section's part of the draft: its provisions with their no-rule reasons (a reason on a provision some outline cites
 * is dropped), its interpretation questions and the documents it names. Its rules come from F's batches.
 */
function sectionDraft(answer: RuleFindingAnswer, cited: ReadonlySet<ProvisionKey>): EncodingDraftContent {
  return {
    provisions: answer.provisions.map((entry) => ({
      key: entry.key,
      noRule:
        entry.noRule && !cited.has(entry.key) ? { reason: entry.noRule.reason, note: reasonNote(entry.noRule) } : null
    })),
    terms: [],
    rules: [],
    questions: interpretationQuestions(answer),
    clauses: {},
    referencedDocuments: answer.referencedDocuments,
    notes: answer.notes
  }
}

/**
 * E's handoff, once every section is answered: outlines with their targets resolved to rule keys across sections (a
 * target that resolves to nothing listed for consolidation), the settings flags, and per section its check's problems,
 * its provisions with their reasons and outlines, and its part of the draft.
 */
export function resolveFindings(sections: readonly FoundSection[], provisions: readonly Provision[]) {
  const all = sections.flatMap((section) => section.finding.outlines)
  const resolved = resolveOutlines(all, provisions)
  const cited = new Set(all.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
  return {
    outlines: resolved.outlines,
    unresolved: resolved.unresolved,
    settingsFlags: sections.flatMap((section) => settingsFlagsOf(section.finding.answer)),
    sections: sections.map((section) => {
      const own = new Set(section.finding.outlines.map((outline) => outline.key))
      const keyed = resolved.outlines.filter((outline) => own.has(outline.key))
      const draft = sectionDraft(section.finding.answer, cited)
      return {
        itemId: section.itemId,
        problems: checkSection(section, provisions, all).map(({ code, message }) => ({ code, message })),
        provisions: draft.provisions.map((entry) => ({
          key: entry.key,
          noRule: entry.noRule?.reason ?? null,
          outlines: keyed.filter((outline) => outline.provisionKey === entry.key)
        })),
        draft
      }
    })
  }
}

/** A target that resolved to no rule, as a problem: consolidation sees it among the cross-references. */
export const unresolvedProblem = (target: UnresolvedTarget) => ({
  itemId: target.key,
  code: "unresolved-target",
  message: `${target.target} resolves to no rule (consolidation's cross-references)`
})

// ─── C. Shared vocabulary ───────────────────────────────────────────────────────────────────────

export type VocabularyGroupInput = {
  outlines: Outline[]
  /** Every provision the group's outlines may cite. */
  provisions: Provision[]
  definedTerms: TermContent[]
  /** Only from a reviewed or published rulebook. */
  previous: TermContent[]
  documents: DocumentLine[]
}

/** The terms C may reuse by key: B's and the previous vocabulary's. */
export const knownTermsOf = (input: Pick<VocabularyGroupInput, "definedTerms" | "previous">) => [
  ...input.definedTerms,
  ...input.previous
]

/** C over one group (a first answer, or a rerun with `problems`): the group's terms with what each serves. */
export async function buildGroupVocabulary(input: Call & { input: VocabularyGroupInput; problems?: string }) {
  const result = await runStepPrompt({
    ai: input.ai,
    cacheStage: input.cacheStage,
    step: "sharedVocabulary",
    itemId: input.itemId,
    schema: sharedVocabularyAnswer,
    variables: sharedVocabularyVariables({ ...input.input, problems: input.problems })
  })
  if (!result.isValid) {
    return { call: result.call, group: null, notes: [], problems: zodProblems(result.issues) }
  }
  const group: GroupVocabulary = {
    groupId: input.itemId,
    outlines: input.input.outlines,
    ...sharedVocabularyTerms(result.object, knownTermsOf(input.input))
  }
  return { call: result.call, group, notes: result.object.notes, problems: [] }
}

/** The problems a group is rerun with: the check's across groups, or, when its answer failed Zod, the answer's. */
export const vocabularyRerunProblems = (found: readonly StepProblem[], zod: readonly ItemProblem[]) =>
  found.length > 0 ? problemsText(found) : answerProblemsText(zod)

/**
 * Every term C-merge sees, with exact keys merged: B's, the previous vocabulary's, then each group's in the groups'
 * order, with the outlines each serves.
 */
export function vocabularyEntries(
  input: Pick<VocabularyGroupInput, "definedTerms" | "previous">,
  groups: readonly Pick<GroupVocabulary, "terms" | "serves">[]
) {
  const entries: VocabularyEntry[] = [
    ...input.definedTerms.map((term) => ({ term, serves: [], origin: "defined" as const })),
    ...input.previous.map((term) => ({ term, serves: [], origin: "previous" as const })),
    ...groups.flatMap((group, index) =>
      group.terms.map((term) => ({
        term,
        serves: group.serves.get(term.key) ?? [],
        origin: `group ${index + 1}` as const
      }))
    )
  ]
  return mergeExactKeys(entries)
}

// ─── C-merge ────────────────────────────────────────────────────────────────────────────────────

const noMerges: VocabularyMergeAnswer = { merges: [], renames: [], distinct: [], notes: [] }

/**
 * C-merge's call over the entries' clusters (`mergeClusters`, which the caller finds once: matching every pair of
 * labels takes long, and freezing the vocabulary needs them too); null when there are none.
 */
export async function mergeVocabulary(
  input: Call & { entries: readonly VocabularyEntry[]; clusters: readonly number[][] }
) {
  const { entries, clusters } = input
  if (clusters.length === 0) {
    return null
  }
  const { variables } = vocabularyMergeVariables(entries, clusters)
  const result = await runStepPrompt({
    ai: input.ai,
    cacheStage: input.cacheStage,
    step: "vocabularyMerge",
    itemId: input.itemId,
    schema: vocabularyMergeAnswer,
    variables
  })
  return result.isValid
    ? { call: result.call, answer: result.object, problems: [] }
    : { call: result.call, answer: null, problems: zodProblems(result.issues) }
}

/**
 * The frozen vocabulary: C-merge's answer, about the entries' clusters, applied to the entries (no answer merges
 * nothing), exact keys merged again, with what each term serves.
 */
export function freezeVocabulary(
  entries: readonly VocabularyEntry[],
  clusters: readonly number[][],
  answer: VocabularyMergeAnswer | null
) {
  const { ids } = vocabularyMergeVariables(entries, clusters)
  return applyVocabularyMerge({ entries, ids, answer: answer ?? noMerges })
}

// ─── F. Structure the rules ─────────────────────────────────────────────────────────────────────

export type SettingsFlag = { provisionKey: ProvisionKey; clause: string; summary: string }

export type StructuringBatch = {
  id: string
  outlines: Outline[]
  /** Outlines of other batches these override, enforce or except, or that cite the provisions shown. */
  related: Outline[]
  vocabulary: TermContent[]
  documents: DocumentLine[]
  /** The provisions the batch's outlines and flags cite. */
  provisions: Provision[]
  settingsFlags: SettingsFlag[]
}

/**
 * F's batches over every outline (with the term keys that serve it), each with what it reads beside its own. Subjects
 * and parties E gave as labels (things C was to add) are keyed against the frozen vocabulary first, as E's were against
 * B's terms, so F's rules name terms.
 */
export function structuringBatchesOf(input: {
  outlines: readonly Outline[]
  vocabulary: TermContent[]
  documents: DocumentLine[]
  provisions: readonly Provision[]
  settingsFlags: readonly SettingsFlag[]
}): StructuringBatch[] {
  const outlines = input.outlines.map((outline) => keyedOutline(outline, input.vocabulary))
  return structuringBatches(outlines).map((batch) => {
    const cited = new Set(batch.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
    const settingsFlags = input.settingsFlags.filter((flag) => cited.has(flag.provisionKey))
    const shown = new Set([...cited, ...settingsFlags.map((flag) => flag.provisionKey)])
    return {
      id: batch[0]?.key ?? "",
      outlines: batch,
      related: relatedOutlines(batch, outlines),
      vocabulary: input.vocabulary,
      documents: input.documents,
      provisions: input.provisions.filter((provision) => shown.has(provision.key)),
      settingsFlags
    }
  })
}

/** A rule F structured: its outline, the draft the two make, the rule when it passes Zod, and what code found. */
export type Structured = {
  outline: Outline
  draft: Record<string, unknown>
  rule: RuleContent | null
  issues: string[]
}

/** One F call over a batch (a first pass, or a retry with the failing rules as problems). */
export async function structureBatch(input: {
  ai: StepAi
  cacheStage: string
  batch: StructuringBatch
  /** When a rule takes effect: its main citation's document edition. */
  effectiveFrom: (outline: Outline) => string
  problems?: string
}) {
  const { batch } = input
  const result = await runStepPrompt({
    ai: input.ai,
    cacheStage: input.cacheStage,
    step: "ruleStructuring",
    itemId: batch.id,
    schema: ruleStructuringAnswer,
    variables: ruleStructuringVariables({ ...batch, problems: input.problems })
  })
  if (!result.isValid) {
    return { call: result.call, answer: null, issues: zodProblems(result.issues), structured: [] }
  }
  const answer: RuleStructuringAnswer = result.object
  const merged = draftsOf({ outlines: batch.outlines, rules: answer.rules, effectiveFrom: input.effectiveFrom })
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
      ...merged.problems.map(({ code, message }) => ({ code, message })),
      ...answer.outlineIssues.map((issue) => ({
        code: "outline-issue",
        message: `${issue.provision}: ${issue.issue}`
      })),
      ...answer.unfixable.map((item) => ({ code: "unfixable", message: `${item.key}: ${item.note}` }))
    ],
    structured
  }
}

/**
 * F's first pass over a batch. An answer that fails Zod as a whole (an empty tool call, a malformed field) is rerun
 * `reruns` times with its problems, which make it a new call rather than the cached one.
 */
export async function structureFirstPass(input: Parameters<typeof structureBatch>[0] & { reruns: number }) {
  const calls: ModelCall[] = []
  let pass = await structureBatch(input)
  calls.push(pass.call)
  for (let rerun = 0; !pass.answer && rerun < input.reruns; rerun += 1) {
    pass = await structureBatch({ ...input, problems: answerProblemsText(pass.issues) })
    calls.push(pass.call)
  }
  return { ...pass, calls }
}

export type RuleProblem = { code: string; message: string; path: (string | number)[] }

/** The draft fields code copies from the outline (`draftOf`), which no answer of F can change. */
const outlineFields = new Set(["appliesTo", "bearer", "decidedBy", "imposedBy", "against", "requestTypes"])

/** Whether a problem lies in a field F doesn't write, so retrying F can't fix it. */
export const isOutlineProblem = (problem: RuleProblem) =>
  problem.code === "zod" && outlineFields.has(problem.message.split(":")[1]?.trim().split(".")[0] ?? "")

/**
 * The validator's problems with each of a batch's structured rules, read with its vocabulary, every rule structured so
 * far and other rules it may target (those of batches outside a partial run). Only the batch's own rules are checked:
 * each batch's check would otherwise check every rule of the run again.
 */
export function checkStructured(input: {
  /** The batch's rules. */
  checked: readonly Structured[]
  /** Every rule structured so far, the batch's included. */
  structured: readonly Structured[]
  vocabulary: readonly TermContent[]
  provisions: readonly Provision[]
  documents: readonly Pick<GoverningDocument, "key" | "kind">[]
  otherRules?: readonly RuleContent[]
}): Map<string, RuleProblem[]> {
  const own = input.structured.flatMap((item) => (item.rule ? [item.rule] : []))
  const keys = new Set(input.structured.map((item) => item.outline.key))
  const rules = [...own, ...(input.otherRules ?? []).filter((rule) => !keys.has(rule.key))]
  const found = Map.groupBy(
    recordProblems({
      terms: input.vocabulary,
      rules,
      provisions: input.provisions,
      documents: input.documents,
      about: new Set(input.checked.map((item) => item.outline.key))
    }),
    (problem) => problem.recordKey
  )
  return new Map(
    input.checked.map((item) => [
      item.outline.key,
      [
        ...item.issues.map((issue) => ({ code: issue.split(":")[0] ?? "zod", message: issue, path: [] })),
        ...(found.get(item.outline.key) ?? []).map((problem) => ({
          code: problem.code,
          message: problem.message,
          path: problem.path
        }))
      ]
    ])
  )
}

/** The rules of a batch that still have problems, as the retry shows them. */
export function retryRecords(
  structured: readonly Structured[],
  problemsOf: (key: string) => readonly RuleProblem[]
): ProblemRecord[] {
  return structured.flatMap((item) => {
    const problems = problemsOf(item.outline.key)
    return problems.length === 0
      ? []
      : [
          {
            unitId: item.outline.unitId,
            key: item.outline.key,
            record: item.draft,
            problems: problems.map((problem) => ({ ...problem, class: problem.code }))
          }
        ]
  })
}

/** One retry of a batch's failing rules, by F with their problems: the batch narrowed to them, under its own id. */
export const retryBatch = (
  input: Omit<Parameters<typeof structureBatch>[0], "problems">,
  records: readonly ProblemRecord[],
  round: number
) => {
  const failing = new Set(records.map((record) => record.key))
  return structureBatch({
    ...input,
    batch: {
      ...input.batch,
      id: `${input.batch.id}:retry-${round}`,
      outlines: input.batch.outlines.filter((outline) => failing.has(outline.key))
    },
    problems: retryProblemsText(records)
  })
}

// ─── Consolidation ──────────────────────────────────────────────────────────────────────────────

export type ConsolidationInput = Parameters<typeof consolidationVariables>[0]

/**
 * Consolidation's input over a merged rulebook: its rules and terms, its documents in precedence order, the
 * cross-references between sections (and the targets that resolved to nothing), the exceptions that override nothing
 * yet, and the rules that are one reading of an ambiguous passage.
 */
export function consolidationInputOf(input: {
  rulebook: MergedRulebook
  references: ReadonlyMap<ProvisionKey, readonly ProvisionKey[]>
  sectionOf: (provisionKey: ProvisionKey) => string | undefined
  unresolved: readonly UnresolvedTarget[]
  readings: readonly string[]
}): ConsolidationInput {
  const { rulebook, sectionOf } = input
  return {
    rules: rulebook.rules,
    terms: rulebook.terms,
    documents: rulebook.documents,
    precedence: rulebook.settings.clauses.precedence?.order ?? [],
    crossReferences: crossReferenceLines({
      rules: rulebook.rules,
      references: input.references,
      sectionOf,
      unresolved: input.unresolved
    }),
    exceptions: exceptionLines({ rules: rulebook.rules, sectionOf }),
    readings: input.readings
  }
}

/** The rules a set of questions keeps in their options: each is one reading of an ambiguous passage. */
export const readingsOf = (questions: readonly Pick<QuestionContent, "kind" | "options">[]) => [
  ...new Set(
    questions
      .filter((question) => question.kind === "interpretation")
      .flatMap((question) => question.options.flatMap((option) => option.keeps))
  )
]

/** hoa-consolidation's call: its rule keys are the call's enums. */
export const consolidateRules = (input: Call & { input: ConsolidationInput }) =>
  runStepPrompt({
    ai: input.ai,
    cacheStage: input.cacheStage,
    step: "consolidation",
    itemId: input.itemId,
    schema: consolidationAnswer(input.input.rules),
    variables: consolidationVariables(input.input)
  })
