import invariant from "tiny-invariant"
import { z } from "zod"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { runObjectPrompt } from "@/ai/runPrompt"
import {
  documentsOf,
  knownDocumentsOf,
  structureOptionsOf,
  type DocumentStructure
} from "@/documents/documentStructure"
import { modelCallOf, type ModelCall, type StepRunner } from "@/jobs/steps"
import type { Page } from "@/ocr/page"
import { carryNoRules, type PreviousReview } from "@/rulebook/carryForward"
import type { Edition, GoverningDocument, ProvisionKey, RuleKey } from "@/schema/types"
import type { EncodingDraftContent, TermContent } from "@/schema/zod"
import { draftContent, type BuildFailure } from "./buildRecords"
import { checkStructure } from "./check"
import { cleanPages } from "./clean"
import { applyConsolidation } from "./consolidate"
import { mergeDrafts, mergeTerms, type MergeInput } from "./merge"
import { planUnits, type EncodingUnit } from "./plan"
import { structureRepairVariables } from "./promptVariables"
import { structureDocument, type StructuredDocument } from "./provisions"
import { analyzeReferences, citedProvisions } from "./references"
import { checkSources, sourceProblemSchema, SourcesRejectedError } from "./sourceCheck"
import {
  analysisOutput,
  consolidateOutput,
  definedTermsOutput,
  encodingUnit,
  findingCheckOutput,
  findingsOutput,
  findRulesOutput,
  groupVocabularyOutput,
  mergeOutput,
  structureCheckOutput,
  structureOutput,
  structureRulesOutput,
  vocabularyCheckOutput,
  vocabularyMergeOutput,
  type StructureRulesOutput
} from "./stepOutputs"
import { proposedPropertyTerm } from "./steps/drafts"
import {
  buildGroupVocabulary,
  checkFindings,
  checkStructured,
  consolidateRules,
  consolidationInputOf,
  definedTermsInput,
  findDefinedTerms,
  findingAnswerOf,
  findingOf,
  findingRerunProblems,
  findRules,
  freezeVocabulary,
  hasClusters,
  mergeVocabulary,
  readingsOf,
  resolveFindings,
  retryBatch,
  retryRecords,
  structureFirstPass,
  structuringBatchesOf,
  vocabularyEntries,
  vocabularyRerunProblems,
  zodProblems,
  type DocumentLine,
  type ItemProblem,
  type Structured,
  type StructuringBatch,
  type VocabularyGroupInput
} from "./steps/pipeline"
import type { RuleFindingAnswer } from "./steps/ruleFinding"
import { clausesOf, type RuleStructuringAnswer } from "./steps/ruleStructuring"
import { stepPromptTraceNames, type StepAi } from "./steps/run"
import { checkSharedVocabulary, vocabularyGroups, withReadKeys, type GroupVocabulary } from "./steps/vocabulary"
import type { VocabularyMergeAnswer } from "./steps/vocabularyMerge"
import { repairStructure, structureRepairAnswer } from "./structureRepair"

// The rulebook build (encoding.md, Stages): structure and analyze the uploads, then the reordered step pipeline
// (implementation-plan.md, R.7 design): B defined terms, the plan, E find the rules, C shared vocabulary, C-merge, F
// structure the rules, merge and consolidation, then the draft's records. Each model call is its own durable step and
// every check across items a code step between rounds, so a replay reads the same answers in the same order. The
// per-item work is shared with the step evaluations (steps/pipeline.ts). Everything the build needs is injected: a step
// runner (Workflow steps in the app, plain calls in scripts and tests), the models and cache, each upload's page records
// and structure, and the earlier review that carries forward.

/** The job stages the build reports, in order (encoding.md, Stages). */
export const buildStages = [
  "check",
  "structure",
  "analyze",
  "defined-terms",
  "plan",
  "find-rules",
  "vocabulary",
  "vocabulary-merge",
  "structure-rules",
  "merge",
  "consolidate"
] as const
export type BuildStage = (typeof buildStages)[number]

/** Stages that may have nothing to do: C-merge runs only when the vocabulary has clusters to decide. */
export const optionalBuildStages: readonly BuildStage[] = ["vocabulary-merge"]

/** What the build's model calls need: the prompt loader, models, versions pinned in resolve-prompts and the cache. */
export type BuildAi = StepAi

/** An uploaded document to build from. */
export type BuildSource = {
  documentId: string
  title: string
  structure: DocumentStructure
  edition: Edition
  loadPages: () => Promise<readonly Page[]>
}

export type BuildInput = {
  organizationId: string
  sources: readonly BuildSource[]
  step: StepRunner
  ai: BuildAi
  /**
   * The review that carries forward to unchanged records, read when the draft's records are made so review done while
   * the build ran carries too.
   */
  previous: (() => Promise<PreviousReview>) | null
  /** When the records are proposed. */
  now: string
  progress?: (stage: BuildStage, done: number, total: number) => Promise<void>
  /** Finds rules only in the sections this keeps (evaluation slices); the rest of the documents is left out. */
  selectUnits?: (unit: EncodingUnit) => boolean
  /** Model calls in flight at once: `ENCODING_CONCURRENCY` (encoding.md, Cost and scale). */
  concurrency: number
}

/** One stage's work: items, model calls, problems its check found before reruns, and what was left after. */
export type StageReport = {
  stage: BuildStage
  items: number
  calls: number
  /** Calls beyond one per item: reruns with problems, and F's retries. */
  reruns: number
  problems: number
  problemsLeft: number
}

/** Each outlined rule after F: whether it passed Zod, how many retry rounds it took, and the issues it was left with. */
export type RuleReport = {
  key: RuleKey
  batchId: string
  isValid: boolean
  retries: number
  /** Its issues in the consolidated draft; null when it isn't in the draft. */
  problems: number | null
}

const traceNames: Record<string, string> = {
  [pipelinePrompts.structureRepair.name]: "structure-repair",
  ...stepPromptTraceNames
}

/** Runs `run` over `items`, at most `limit` at a time, settling each like `Promise.allSettled`. */
export async function settleEach<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = []
  let next = 0
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index]
      if (item === undefined) {
        continue
      }
      try {
        results[index] = { status: "fulfilled", value: await run(item) }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * `settleEach` with the first item run alone: a stage's calls share a long cached prefix (instructions, core terms,
 * the vocabulary), and calls started together each pay to write it, so one call writes it and the rest read it.
 */
export async function settleWarm<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
  const [first, ...rest] = items
  if (first === undefined) {
    return []
  }
  const warmed = await settleEach([first], 1, run)
  return [...warmed, ...(await settleEach(rest, limit, run))]
}

const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

const documentKeyOf = (provisionKey: string) => provisionKey.slice(0, Math.max(0, provisionKey.indexOf(":")))

const stillInvalid = (problems: readonly ItemProblem[]) =>
  `The answer still fails Zod: ${problems[0]?.message ?? "no answer"}`

type BatchState = {
  batch: StructuringBatch
  structured: Structured[]
  proposed: TermContent[]
  clauses: EncodingDraftContent["clauses"]
  notes: string[]
}

/** F's answer as its step stores it: the drafts it makes with the batch's outlines, and what the draft needs. */
function storedStructure(
  pass: { answer: RuleStructuringAnswer | null; issues: ItemProblem[]; structured: Structured[] },
  calls: ModelCall[]
): StructureRulesOutput {
  return {
    rules: pass.structured.map(({ outline, draft, rule, issues }) => ({ key: outline.key, draft, rule, issues })),
    proposedTerms: (pass.answer?.proposedTerms ?? []).map(proposedPropertyTerm),
    clauses: pass.answer ? clausesOf(pass.answer) : {},
    notes: pass.answer?.notes ?? [],
    problems: pass.issues,
    calls
  }
}

/** A stored F answer's rules with their outlines again. */
const structuredOf = (batch: StructuringBatch, output: StructureRulesOutput): Structured[] =>
  output.rules.flatMap((item) => {
    const outline = batch.outlines.find((found) => found.key === item.key)
    return outline ? [{ outline, draft: item.draft, rule: item.rule, issues: item.issues }] : []
  })

/** Builds a draft rulebook from uploaded documents (encoding.md, Stages). */
export async function buildRulebook(input: BuildInput) {
  const { ai, step, organizationId, concurrency } = input
  const progress = async (stage: BuildStage, done: number, total: number) => input.progress?.(stage, done, total)
  const failures: BuildFailure[] = []
  const calls: ModelCall[] = []
  const notes: string[] = []
  const stages: StageReport[] = []
  /** Reports progress per item: `done` of `total`, counting on from `start` (a stage's reruns follow its first pass). */
  const counter = (stage: BuildStage, total: number, start = 0) => {
    let done = start
    return async () => {
      done += 1
      await progress(stage, done, total)
    }
  }

  // 1b. Check: what later steps validate about the uploads themselves, before any model call.
  await progress("check", 0, input.sources.length)
  const sourceProblems = await step("check", z.array(sourceProblemSchema), async () => checkSources(input.sources))
  if (sourceProblems.length > 0) {
    throw new SourcesRejectedError(sourceProblems)
  }

  // 2. Structure: provisions from the page records; a model proposes the outline only when the parser fails its check.
  await progress("structure", 0, input.sources.length)
  const structured: { source: BuildSource; documents: StructuredDocument[] }[] = []
  for (const source of input.sources) {
    const output = await step(
      `structure:${source.documentId}`,
      structureOutput,
      async () => {
        const clean = cleanPages(await source.loadPages())
        const options = structureOptionsOf(source.structure, source.documentId)
        const documents = structureDocument(clean, options)
        const check = checkStructure(clean, documents)
        if (!check.needsRepair) {
          return { documents, check, isRepaired: false, calls: [] }
        }
        const prompt = pipelinePrompts.structureRepair
        const result = await runObjectPrompt({
          loadPrompt: ai.loadPrompt,
          createModel: ai.createModel,
          defaultModelId: ai.modelId,
          promptVersion: ai.promptVersions[prompt.name],
          traceName: traceNames[prompt.name] ?? prompt.name,
          environment: ai.environment,
          sessionId: ai.sessionId,
          cache: ai.cache?.("structure"),
          prompt,
          schema: structureRepairAnswer,
          variables: structureRepairVariables(source.title, clean, documents, check)
        })
        const repaired = repairStructure(clean, options, { documents, check }, result.object.markers)
        return { ...repaired, calls: [modelCallOf(source.documentId, result, traceNames)] }
      },
      "model"
    )
    calls.push(...output.calls)
    structured.push({ source, documents: output.documents })
  }
  const uploaded = input.sources.flatMap((source) => documentsOf(source.title, source.structure, source.edition))
  const allStructured = structured.flatMap((item) => item.documents)
  const known = input.sources.flatMap((source) => knownDocumentsOf(source.structure))

  // 3. Analyze: cross-references resolved against every document, and the documents named but not uploaded.
  await progress("analyze", 0, structured.length)
  const references = new Map<ProvisionKey, ProvisionKey[]>()
  const referenced = new Map<string, GoverningDocument>()
  for (const { source, documents } of structured) {
    const output = await step(`analyze:${source.documentId}`, analysisOutput, async () => {
      const analysis = analyzeReferences(allStructured, known)
      const own = documents.flatMap((document) => document.provisions.map((provision) => provision.key))
      return {
        references: own.map((key): [string, string[]] => [
          key,
          citedProvisions(analysis.references.get(key) ?? [], key)
        ]),
        referencedDocuments: analysis.referencedDocuments
      }
    })
    output.references.forEach(([key, cited]) => references.set(key, cited))
    for (const document of output.referencedDocuments) {
      referenced.set(document.key, { ...document, issuedBy: null, governs: null, edition: null })
    }
  }
  const governing = [...uploaded, ...referenced.values()]
  const documentLines: DocumentLine[] = governing.map(({ key, kind, title, edition }) => ({
    key,
    kind,
    title,
    edition
  }))
  const effectiveFrom = new Map(
    uploaded.flatMap((document) => (document.edition ? [[document.key, document.edition.effectiveFrom]] : []))
  )
  /** A rule takes effect with its main citation's document edition. */
  const dateOf = (provisionKey: ProvisionKey) =>
    effectiveFrom.get(documentKeyOf(provisionKey)) ?? input.now.slice(0, 10)
  const provisions = allStructured.flatMap((document) => document.provisions)

  // 4. Defined terms (B): one call per document with definitions or defined-term candidates, rerun once with its
  // problems; the terms merge across documents by key.
  const defining = allStructured.flatMap((document) => {
    const line = documentLines.find((found) => found.key === document.key)
    const item = line ? definedTermsInput(line, document.provisions) : null
    return item && (item.definitions.length > 0 || item.candidates.length > 0) ? [item] : []
  })
  await progress("defined-terms", 0, defining.length)
  const definedDone = counter("defined-terms", defining.length)
  const definedResults = await settleWarm(defining, concurrency, async (item) => {
    const output = await step(
      `defined-terms:${item.document.key}`,
      definedTermsOutput,
      () => findDefinedTerms({ ai, cacheStage: "defined-terms", itemId: item.document.key, input: item, reruns: 1 }),
      "model"
    )
    await definedDone()
    return output
  })
  const extracted: TermContent[] = []
  const definedReport: StageReport = {
    stage: "defined-terms",
    items: defining.length,
    calls: 0,
    reruns: 0,
    problems: 0,
    problemsLeft: 0
  }
  defining.forEach((item, index) => {
    const result = definedResults[index]
    if (result?.status !== "fulfilled") {
      failures.push({ stage: "defined-terms", itemId: item.document.key, message: messageOf(result?.reason) })
      return
    }
    const { terms, problems, found, calls: made } = result.value
    calls.push(...made)
    definedReport.calls += made.length
    definedReport.reruns += made.length - 1
    definedReport.problems += found
    definedReport.problemsLeft += problems.length
    extracted.push(...(terms ?? []))
    if (terms === null) {
      failures.push({ stage: "defined-terms", itemId: item.document.key, message: stillInvalid(problems) })
    }
  })
  stages.push(definedReport)
  const definedTerms = mergeTerms(organizationId, extracted).terms

  // 5. Plan: sections within the token budget, with their context and B's terms.
  await progress("plan", 0, 1)
  const units = await step("plan", encodingUnit.array(), async () =>
    planUnits({ documents: allStructured, references, vocabulary: definedTerms }).filter(
      (unit) => input.selectUnits?.(unit) ?? true
    )
  )
  // Every provision resolves citations; coverage counts only the planned sections' provisions (all of them in the app).
  const encodedKeys = new Set(units.flatMap((unit) => unit.provisions.map((provision) => provision.key)))
  const sectionByProvision = new Map(
    units.flatMap((unit) => unit.provisions.map((provision) => [provision.key, unit.id] as const))
  )
  const sectionOf = (key: ProvisionKey) => sectionByProvision.get(key)
  const inScope = <I extends { code: string; recordKey: string }>(issues: readonly I[]) =>
    issues.filter((issue) => issue.code !== "coverage" || encodedKeys.has(issue.recordKey))

  // 6. Find the rules (E): one call per section; the check across sections once every first answer is in; one rerun
  // of each failing section; then the outlines keyed, their targets resolved, and each section's part of the draft.
  // A reviewed rulebook's things, parties and categories will feed E's known terms; there are none yet.
  const knownTerms: TermContent[] = []
  const findOutput = findRulesOutput(findingAnswerOf(knownTerms))
  const definitions = provisions.filter((provision) => provision.kind === "definition")
  const findingInput = (unit: EncodingUnit) => ({ unit, documents: documentLines, definitions, knownTerms })
  const findRulesOf = (unit: EncodingUnit, name: string, problems?: string) =>
    step(
      name,
      findOutput,
      () =>
        findRules({
          ai,
          cacheStage: "find-rules",
          itemId: unit.id,
          input: findingInput(unit),
          definedTerms,
          problems
        }),
      "model"
    )
  const findingReport: StageReport = {
    stage: "find-rules",
    items: units.length,
    calls: 0,
    reruns: 0,
    problems: 0,
    problemsLeft: 0
  }
  const answers = new Map<string, RuleFindingAnswer>()
  const invalid = new Map<string, ItemProblem[]>()
  const settleFinding = (
    unit: EncodingUnit,
    result: PromiseSettledResult<z.infer<typeof findOutput>> | undefined,
    itemId: string
  ) => {
    if (result?.status !== "fulfilled") {
      failures.push({ stage: "find-rules", itemId, message: messageOf(result?.reason) })
      return
    }
    calls.push(result.value.call)
    findingReport.calls += 1
    if (result.value.answer) {
      answers.set(unit.id, result.value.answer)
      invalid.delete(unit.id)
    } else {
      // A rerun that fails Zod keeps the section's first answer.
      invalid.set(unit.id, result.value.problems)
    }
  }
  await progress("find-rules", 0, units.length)
  const firstDone = counter("find-rules", units.length)
  const firstAnswers = await settleWarm(units, concurrency, async (unit) => {
    const output = await findRulesOf(unit, `find-rules:${unit.id}`)
    await firstDone()
    return output
  })
  units.forEach((unit, index) => settleFinding(unit, firstAnswers[index], unit.id))
  const sections = () =>
    units.flatMap((unit) => {
      const answer = answers.get(unit.id)
      return answer ? [{ itemId: unit.id, unit, finding: findingOf(answer, unit, definedTerms) }] : []
    })
  const checked = new Map(
    await step("find-rules:check", findingCheckOutput, async () => [...checkFindings(sections(), provisions)])
  )
  const rerun = units.filter((unit) => invalid.has(unit.id) || (checked.get(unit.id) ?? []).length > 0)
  findingReport.problems =
    [...checked.values()].reduce((sum, found) => sum + found.length, 0) +
    [...invalid.values()].reduce((sum, found) => sum + found.length, 0)
  const rerunDone = counter("find-rules", units.length + rerun.length, units.length)
  const reruns = await settleEach(rerun, concurrency, async (unit) => {
    const problems = findingRerunProblems(
      answers.has(unit.id) ? (checked.get(unit.id) ?? []) : null,
      invalid.get(unit.id) ?? []
    )
    const output = await findRulesOf(unit, `find-rules:${unit.id}:rerun`, problems)
    await rerunDone()
    return output
  })
  rerun.forEach((unit, index) => settleFinding(unit, reruns[index], `${unit.id}:rerun`))
  findingReport.reruns = reruns.filter((result) => result.status === "fulfilled").length
  for (const [unitId, problems] of invalid) {
    if (!answers.has(unitId)) {
      failures.push({ stage: "find-rules", itemId: unitId, message: stillInvalid(problems) })
    }
  }
  const findings = await step("find-rules:resolve", findingsOutput, async () => {
    const resolved = resolveFindings(sections(), provisions)
    return {
      outlines: resolved.outlines,
      unresolved: resolved.unresolved,
      settingsFlags: resolved.settingsFlags,
      sections: resolved.sections.map((section) => ({
        unitId: section.itemId,
        draft: section.draft,
        problems: section.problems
      }))
    }
  })
  findingReport.problemsLeft =
    findings.sections.reduce((sum, section) => sum + section.problems.length, 0) + findings.unresolved.length
  stages.push(findingReport)

  // 7. Shared vocabulary (C): one call per group of sections (token and outline budgets); the check across groups
  // once every first answer is in; one rerun of each failing group.
  // A reviewed rulebook's vocabulary will feed C's previous terms; there are none yet.
  const previous: TermContent[] = []
  const outlineCounts = new Map<string, number>()
  for (const outline of findings.outlines) {
    outlineCounts.set(outline.unitId, (outlineCounts.get(outline.unitId) ?? 0) + 1)
  }
  const groups = vocabularyGroups(units, (unit) => outlineCounts.get(unit.id) ?? 0).flatMap((group) => {
    const ids = new Set(group.units.map((unit) => unit.id))
    const outlines = findings.outlines.filter((outline) => ids.has(outline.unitId))
    const cited = new Set(outlines.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
    const groupInput: VocabularyGroupInput = {
      outlines,
      provisions: provisions.filter((provision) => cited.has(provision.key)),
      definedTerms,
      previous,
      documents: documentLines
    }
    // A group whose sections have no rules reads nothing.
    return outlines.length > 0 ? [{ id: group.id, input: groupInput }] : []
  })
  const vocabularyOf = (group: (typeof groups)[number], name: string, problems?: string) =>
    step(
      name,
      groupVocabularyOutput,
      async () => {
        const result = await buildGroupVocabulary({
          ai,
          cacheStage: "vocabulary",
          itemId: group.id,
          input: group.input,
          problems
        })
        return {
          group: result.group && {
            terms: result.group.terms,
            serves: Object.fromEntries(result.group.serves),
            problems: [...result.group.problems]
          },
          notes: result.notes,
          problems: result.problems,
          call: result.call
        }
      },
      "model"
    )
  const vocabularyReport: StageReport = {
    stage: "vocabulary",
    items: groups.length,
    calls: 0,
    reruns: 0,
    problems: 0,
    problemsLeft: 0
  }
  const built = new Map<string, GroupVocabulary>()
  const failedGroups = new Map<string, ItemProblem[]>()
  const groupNotes = new Map<string, string[]>()
  const settleGroup = (
    group: (typeof groups)[number],
    result: PromiseSettledResult<z.infer<typeof groupVocabularyOutput>> | undefined,
    itemId: string
  ) => {
    if (result?.status !== "fulfilled") {
      failures.push({ stage: "vocabulary", itemId, message: messageOf(result?.reason) })
      return
    }
    const { group: answer, notes: groupNoted, problems, call } = result.value
    calls.push(call)
    vocabularyReport.calls += 1
    if (answer) {
      built.set(group.id, {
        groupId: group.id,
        outlines: group.input.outlines,
        terms: answer.terms,
        serves: new Map(Object.entries(answer.serves)),
        problems: answer.problems
      })
      groupNotes.set(group.id, groupNoted)
      failedGroups.delete(group.id)
    } else {
      // A rerun that fails Zod keeps the group's first answer.
      failedGroups.set(group.id, problems)
    }
  }
  await progress("vocabulary", 0, groups.length)
  const groupDone = counter("vocabulary", groups.length)
  const firstGroups = await settleWarm(groups, concurrency, async (group) => {
    const output = await vocabularyOf(group, `vocabulary:${group.id}`)
    await groupDone()
    return output
  })
  groups.forEach((group, index) => settleGroup(group, firstGroups[index], group.id))
  const builtGroups = () => groups.flatMap((group) => built.get(group.id) ?? [])
  const knownToVocabulary = [...definedTerms, ...previous]
  const groupProblems = new Map(
    await step("vocabulary:check", vocabularyCheckOutput, async () => [
      ...checkSharedVocabulary(builtGroups(), knownToVocabulary)
    ])
  )
  const rerunGroups = groups.filter(
    (group) => failedGroups.has(group.id) || (groupProblems.get(group.id) ?? []).length > 0
  )
  vocabularyReport.problems =
    [...groupProblems.values()].reduce((sum, found) => sum + found.length, 0) +
    [...failedGroups.values()].reduce((sum, found) => sum + found.length, 0)
  const groupRerunDone = counter("vocabulary", groups.length + rerunGroups.length, groups.length)
  const groupReruns = await settleEach(rerunGroups, concurrency, async (group) => {
    const problems = vocabularyRerunProblems(groupProblems.get(group.id) ?? [], failedGroups.get(group.id) ?? [])
    const output = await vocabularyOf(group, `vocabulary:${group.id}:rerun`, problems)
    await groupRerunDone()
    return output
  })
  rerunGroups.forEach((group, index) => settleGroup(group, groupReruns[index], `${group.id}:rerun`))
  vocabularyReport.reruns = groupReruns.filter((result) => result.status === "fulfilled").length
  for (const [groupId, problems] of failedGroups) {
    if (!built.has(groupId)) {
      failures.push({ stage: "vocabulary", itemId: groupId, message: stillInvalid(problems) })
    }
  }
  vocabularyReport.problemsLeft = [...checkSharedVocabulary(builtGroups(), knownToVocabulary).values()].reduce(
    (sum, found) => sum + found.length,
    0
  )
  stages.push(vocabularyReport)
  for (const group of groups) {
    notes.push(...(groupNotes.get(group.id) ?? []))
  }

  // 8. C-merge: exact keys merge, clusters of near-duplicates and collisions go to one call, and the vocabulary
  // freezes with what each term serves. With no clusters there's nothing to decide and no call.
  const entries = vocabularyEntries({ definedTerms, previous }, builtGroups())
  const mergeReport: StageReport = {
    stage: "vocabulary-merge",
    items: 0,
    calls: 0,
    reruns: 0,
    problems: 0,
    problemsLeft: 0
  }
  let mergeAnswer: VocabularyMergeAnswer | null = null
  if (hasClusters(entries)) {
    mergeReport.items = 1
    await progress("vocabulary-merge", 0, 1)
    try {
      const output = await step(
        "vocabulary-merge",
        vocabularyMergeOutput,
        async () => {
          const merged = await mergeVocabulary({ ai, cacheStage: "vocabulary-merge", itemId: "vocabulary", entries })
          invariant(merged, "The vocabulary has clusters to merge.")
          return merged
        },
        "model"
      )
      calls.push(output.call)
      mergeReport.calls = 1
      mergeAnswer = output.answer
      if (!output.answer) {
        // The vocabulary freezes without merges, and the build goes on.
        mergeReport.problems = output.problems.length
        failures.push({ stage: "vocabulary-merge", itemId: "vocabulary", message: stillInvalid(output.problems) })
      }
    } catch (error) {
      failures.push({ stage: "vocabulary-merge", itemId: "vocabulary", message: messageOf(error) })
    }
    await progress("vocabulary-merge", 1, 1)
  } else {
    await progress("vocabulary-merge", 0, 0)
  }
  const frozen = freezeVocabulary(entries, mergeAnswer)
  mergeReport.problems += frozen.problems.length
  mergeReport.problemsLeft = frozen.problems.length
  stages.push(mergeReport)
  const vocabulary = frozen.terms

  // 9. Structure the rules (F): one call per batch of outlines with their related rules; a batch whose whole answer
  // fails Zod is rerun once with its problems; then up to two retry rounds of the rules the validator still faults.
  const batches = structuringBatchesOf({
    outlines: withReadKeys(findings.outlines, frozen.serves),
    vocabulary,
    documents: documentLines,
    provisions,
    settingsFlags: findings.settingsFlags
  })
  const structuring = {
    ai,
    cacheStage: "structure-rules",
    effectiveFrom: (outline: { provisionKey: string }) => dateOf(outline.provisionKey)
  }
  const structureReport: StageReport = {
    stage: "structure-rules",
    items: batches.length,
    calls: 0,
    reruns: 0,
    problems: 0,
    problemsLeft: 0
  }
  const states = new Map<string, BatchState>()
  const retried = new Map<RuleKey, number>()
  await progress("structure-rules", 0, batches.length)
  const batchDone = counter("structure-rules", batches.length)
  const firstPasses = await settleWarm(batches, concurrency, async (batch) => {
    const output = await step(
      `structure-rules:${batch.id}`,
      structureRulesOutput,
      async () => {
        const pass = await structureFirstPass({ ...structuring, batch, reruns: 1 })
        return storedStructure(pass, pass.calls)
      },
      "model"
    )
    await batchDone()
    return output
  })
  batches.forEach((batch, index) => {
    const result = firstPasses[index]
    if (result?.status !== "fulfilled") {
      failures.push({ stage: "structure-rules", itemId: batch.id, message: messageOf(result?.reason) })
      return
    }
    calls.push(...result.value.calls)
    structureReport.calls += result.value.calls.length
    states.set(batch.id, {
      batch,
      structured: structuredOf(batch, result.value),
      proposed: result.value.proposedTerms,
      clauses: result.value.clauses,
      notes: result.value.notes
    })
  })
  const done = () => batches.flatMap((batch) => states.get(batch.id) ?? [])
  let retryTotal = batches.length
  for (let round = 1; round <= 2; round += 1) {
    // A rule's check reads every rule of the build, so each round waits for the one before.
    const failing = await step(`structure-rules:check:${round}`, structureCheckOutput, async () => {
      const all = done().flatMap((state) => state.structured)
      return done().flatMap((state) => {
        const found = checkStructured({
          structured: all,
          vocabulary: [...state.batch.vocabulary, ...state.proposed],
          provisions,
          documents: governing
        })
        const rules = state.structured.flatMap((item) => {
          const problems = found.get(item.outline.key) ?? []
          return problems.length > 0 ? [{ key: item.outline.key, problems }] : []
        })
        return rules.length > 0 ? [{ batchId: state.batch.id, rules }] : []
      })
    })
    if (round === 1) {
      structureReport.problems = failing.reduce(
        (sum, entry) => sum + entry.rules.reduce((count, rule) => count + rule.problems.length, 0),
        0
      )
    }
    if (failing.length === 0) {
      break
    }
    const retryDone = counter("structure-rules", retryTotal + failing.length, retryTotal)
    retryTotal += failing.length
    const retries = await settleEach(failing, concurrency, async (entry) => {
      const state = states.get(entry.batchId)
      invariant(state, `Batch ${entry.batchId} was structured.`)
      const records = retryRecords(
        state.structured,
        (key) => entry.rules.find((rule) => rule.key === key)?.problems ?? []
      )
      const output = await step(
        `structure-rules:${entry.batchId}:retry-${round}`,
        structureRulesOutput,
        async () => {
          const retry = await retryBatch({ ...structuring, batch: state.batch }, records, round)
          return storedStructure(retry, [retry.call])
        },
        "model"
      )
      await retryDone()
      return output
    })
    failing.forEach((entry, index) => {
      const result = retries[index]
      const state = states.get(entry.batchId)
      if (result?.status !== "fulfilled" || !state) {
        failures.push({
          stage: "structure-rules",
          itemId: `${entry.batchId}:retry-${round}`,
          message: messageOf(result?.status === "rejected" ? result.reason : "The batch wasn't structured.")
        })
        return
      }
      calls.push(...result.value.calls)
      structureReport.calls += result.value.calls.length
      const replaced = new Map(structuredOf(state.batch, result.value).map((item) => [item.outline.key, item]))
      for (const key of replaced.keys()) {
        retried.set(key, round)
      }
      state.structured = state.structured.map((item) => replaced.get(item.outline.key) ?? item)
      state.proposed.push(...result.value.proposedTerms)
      state.notes.push(...result.value.notes)
    })
  }
  structureReport.reruns = structureReport.calls - states.size
  stages.push(structureReport)
  for (const state of done()) {
    const structuredKeys = new Set(state.structured.map((item) => item.outline.key))
    for (const outline of state.batch.outlines.filter((found) => !structuredKeys.has(found.key))) {
      failures.push({ stage: "structure-rules", itemId: outline.key, message: "The rule got no structure." })
    }
    for (const item of state.structured.filter((found) => found.rule === null)) {
      failures.push({
        stage: "structure-rules",
        itemId: item.outline.key,
        message: `The rule still fails Zod: ${item.issues[0] ?? "no structure"}`
      })
    }
  }

  // 10. Merge: one draft per section (E's no-rule reasons, questions and named documents) and per batch (F's rules,
  // proposed terms and clauses) into one rulebook with the frozen vocabulary, verified as a whole.
  const drafts = [
    ...findings.sections.map((section) => ({ unitId: section.unitId, draft: section.draft })),
    ...done().map((state) => ({
      unitId: state.batch.id,
      draft: {
        provisions: [],
        terms: state.proposed,
        rules: state.structured.flatMap((item) => (item.rule ? [item.rule] : [])),
        questions: [],
        clauses: state.clauses,
        referencedDocuments: [],
        notes: state.notes
      }
    }))
  ]
  for (const { draft } of drafts) {
    notes.push(...draft.notes)
  }
  const mergeInput: MergeInput = { organizationId, documents: governing, provisions, vocabulary, units: drafts }
  await progress("merge", 0, 1)
  const mergedRulebook = await step("merge", mergeOutput, async () => {
    const { rulebook, conflicts, coverage, issues } = mergeDrafts(mergeInput)
    const uncovered = coverage.uncovered.filter((key) => encodedKeys.has(key))
    return {
      rulebook,
      conflicts,
      coverage: { provisions: encodedKeys.size, uncovered },
      issues: inScope(issues)
    }
  })

  // 11. Consolidate: duplicates, overrides across sections and conflicts, over rule lines with the cross-references,
  // the exceptions that override nothing yet and the alternative readings; term merges were C-merge's.
  await progress("consolidate", 0, 1)
  const consolidated = await step(
    "consolidate",
    consolidateOutput,
    async () => {
      const { rulebook } = mergedRulebook
      const unchanged = { rulebook, problems: [], issues: mergedRulebook.issues, calls: [], answerProblems: [] }
      if (rulebook.rules.length < 2) {
        return unchanged
      }
      const readings = [
        ...readingsOf(rulebook.questions),
        ...findings.outlines.filter((outline) => outline.interpretation).map((outline) => outline.key)
      ]
      const input = consolidationInputOf({
        rulebook,
        references,
        sectionOf,
        unresolved: findings.unresolved,
        readings: [...new Set(readings)]
      })
      // The model can end its turn without answering; one rerun of the same call, as every other stage has.
      const first = await consolidateRules({ ai, cacheStage: "consolidate", itemId: "rulebook", input })
      const result = first.isValid
        ? first
        : await consolidateRules({ ai, cacheStage: "consolidate", itemId: "rulebook:rerun", input })
      const made = result === first ? [first.call] : [first.call, result.call]
      if (!result.isValid) {
        return { ...unchanged, calls: made, answerProblems: zodProblems(result.issues) }
      }
      const applied = applyConsolidation(rulebook, result.object)
      return { ...applied, issues: inScope(applied.issues), calls: made, answerProblems: [] }
    },
    "model"
  )
  calls.push(...consolidated.calls)
  if (consolidated.answerProblems.length > 0) {
    failures.push({ stage: "consolidate", itemId: "rulebook", message: stillInvalid(consolidated.answerProblems) })
  }
  stages.push({
    stage: "consolidate",
    items: consolidated.calls.length > 0 ? 1 : 0,
    calls: consolidated.calls.length,
    reruns: Math.max(0, consolidated.calls.length - 1),
    problems: consolidated.problems.length + consolidated.answerProblems.length,
    problemsLeft: consolidated.issues.length
  })

  const previousReview = (await input.previous?.()) ?? { rulebooks: [], provisions: [] }
  const content = await draftContent({
    merged: mergedRulebook,
    consolidated,
    now: input.now,
    previous: previousReview.rulebooks
  })
  const reviewedProvisions = await carryNoRules(
    consolidated.rulebook.provisions,
    previousReview.provisions,
    new Set(mergedRulebook.coverage.uncovered)
  )
  const inDraft = new Set(consolidated.rulebook.rules.map((rule) => rule.key))
  const rules: RuleReport[] = batches.flatMap((batch) =>
    batch.outlines.map((outline) => {
      const item = states.get(batch.id)?.structured.find((found) => found.outline.key === outline.key)
      return {
        key: outline.key,
        batchId: batch.id,
        isValid: Boolean(item?.rule),
        retries: retried.get(outline.key) ?? 0,
        problems: inDraft.has(outline.key)
          ? consolidated.issues.filter((issue) => issue.recordKey === outline.key).length
          : null
      }
    })
  )
  // What F left: the issues its rules have in the draft, and a rule that isn't in it counts as one.
  structureReport.problemsLeft = rules.reduce((sum, rule) => sum + (rule.problems ?? 1), 0)
  return {
    /** The uploads' documents with their provisions, and the documents they name, for save-draft. */
    documents: structured.map(({ source }) => ({
      documentId: source.documentId,
      documents: documentsOf(source.title, source.structure, source.edition).map((document) => ({
        document,
        provisions: reviewedProvisions.filter((provision) => provision.key.startsWith(`${document.key}:`))
      }))
    })),
    referencedDocuments: consolidated.rulebook.documents.filter((document) => document.edition === null),
    content,
    failures,
    issues: {
      validator: consolidated.issues,
      conflicts: mergedRulebook.conflicts,
      consolidation: consolidated.problems
    },
    report: { stages, rules, calls, notes }
  }
}

export type BuildResult = Awaited<ReturnType<typeof buildRulebook>>
