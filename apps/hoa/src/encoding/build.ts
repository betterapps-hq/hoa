import { z } from "zod"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptLoader } from "@/ai/promptLoader"
import type { PromptDefinition } from "@/ai/prompts"
import {
  runCheckedObjectPrompt,
  runObjectPrompt,
  type CodeFields,
  type ModelFactory,
  type PromptCache,
  type PromptRunMetrics
} from "@/ai/runPrompt"
import {
  documentsOf,
  knownDocumentsOf,
  structureOptionsOf,
  type DocumentStructure
} from "@/documents/documentStructure"
import { modelCallOf, type ModelCall, type StepRunner } from "@/jobs/steps"
import type { Page } from "@/ocr/page"
import { canonicalJson, sha256Hex } from "@/rulebook/canonical"
import { carryNoRules, type PreviousReview } from "@/rulebook/carryForward"
import type { Edition, GoverningDocument, Provision, ProvisionKey } from "@/schema/types"
import { encodingDraft, encodingPatch, termDraft } from "@/schema/zod"
import { draftContent, type BuildFailure } from "./buildRecords"
import { checkStructure } from "./check"
import { cleanPages } from "./clean"
import { applyConsolidation, consolidation } from "./consolidate"
import { findTermCandidates } from "./definedTerms"
import { mergeDrafts, mergeTerms, type MergeInput } from "./merge"
import { applyPatch } from "./patch"
import { planUnits, type EncodingUnit } from "./plan"
import {
  encodingRepairVariables,
  provisionBlock,
  provisionEncodingVariables,
  rulebookConsolidationVariables,
  structureRepairVariables,
  termExtractionVariables
} from "./promptVariables"
import { structureDocument, type StructuredDocument } from "./provisions"
import { analyzeReferences, citedProvisions } from "./references"
import { groupByUnit, problemsToRepairAlone, verifyUnit, type UnitProblem } from "./repair"
import {
  analysisOutput,
  consolidateOutput,
  encodeOutput,
  encodingUnit,
  mergeOutput,
  repairOutput,
  structureOutput,
  unitProblems,
  unitState,
  vocabularyOutput,
  type RepairOutput,
  type UnitState
} from "./stepOutputs"
import { repairStructure, structureRepairAnswer } from "./structureRepair"

// The rulebook build (encoding.md, Stages 2 to 11): structure, analyze, vocabulary, plan, encode, verify, repair, merge
// and consolidate, then the draft's records. Everything it needs is injected: a step runner (Workflow steps in the app,
// plain calls in scripts and tests), the models and cache, each upload's page records and structure, and the earlier
// review that carries forward.

/** The job stages the build reports, in order (encoding.md, Stages). */
export type BuildStage =
  | "structure"
  | "analyze"
  | "vocabulary"
  | "plan"
  | "encode"
  | "verify"
  | "repair"
  | "merge"
  | "consolidate"

/** What the build's model calls need: the prompt loader, models, versions pinned in resolve-prompts and the cache. */
export type BuildAi = {
  loadPrompt: PromptLoader
  createModel: ModelFactory
  /** `OPENROUTER_MODEL`, for prompts whose version names no model. */
  modelId: string
  environment: string
  /** The job id: one build is one Langfuse session. */
  sessionId: string
  promptVersions: Readonly<Record<string, number>>
  cache?: (stage: BuildStage) => PromptCache
}

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
  /** Encodes only the units this keeps (evaluation slices); the rest of the documents is left out of the draft. */
  selectUnits?: (unit: EncodingUnit) => boolean
  /** Encoding and repair calls in flight at once: `ENCODING_CONCURRENCY` (encoding.md, Cost and scale). */
  concurrency: number
}

/** hoa-term-extraction's answer (encoding.md, Prompts and models). */
const termExtractionAnswer = z.object({ terms: z.array(termDraft), notes: z.array(z.string()).default([]) })

const traceNames: Record<string, string> = {
  [pipelinePrompts.structureRepair.name]: "structure-repair",
  [pipelinePrompts.termExtraction.name]: "term-extraction",
  [pipelinePrompts.provisionEncoding.name]: "provision-encoding",
  [pipelinePrompts.encodingRepair.name]: "encoding-repair",
  [pipelinePrompts.rulebookConsolidation.name]: "rulebook-consolidation"
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mapRecords = (value: unknown, change: (item: Record<string, unknown>) => Record<string, unknown>) =>
  Array.isArray(value) ? value.map((item) => (isRecord(item) ? change(item) : item)) : value

/** The document key of a rule's main citation, read from an unchecked answer. */
function mainDocumentKey(rule: Record<string, unknown>) {
  const [first] = Array.isArray(rule.citations) ? rule.citations : []
  const key = isRecord(first) && typeof first.provisionKey === "string" ? first.provisionKey : ""
  return key.slice(0, Math.max(0, key.indexOf(":")))
}

/** Terms belong to the organization; the model doesn't say so. */
const ownedTerms = (organizationId: string): CodeFields => ({
  names: ["organizationId"],
  fill: (answer) =>
    isRecord(answer) ? { ...answer, terms: mapRecords(answer.terms, (term) => ({ ...term, organizationId })) } : answer
})

/** A draft's terms belong to the organization, and its rules take effect with their main citation's document. */
function draftFields(organizationId: string, effectiveFrom: (documentKey: string) => string): CodeFields {
  const terms = ownedTerms(organizationId)
  return {
    names: ["effectiveFrom", ...terms.names],
    fill: (answer) => {
      const owned = terms.fill(answer)
      return isRecord(owned)
        ? {
            ...owned,
            rules: mapRecords(owned.rules, (rule) => ({ ...rule, effectiveFrom: effectiveFrom(mainDocumentKey(rule)) }))
          }
        : owned
    }
  }
}

const callOf = (itemId: string, metrics: PromptRunMetrics) => modelCallOf(itemId, metrics, traceNames)

/**
 * What a document's vocabulary is reused by: the organization, the document, the term-extraction version and the text
 * of its definitions. The candidates code finds elsewhere in the document are left out, so a change outside the
 * definitions keeps the vocabulary, and with it every unchanged unit's prompt.
 */
const definitionsKey = (
  organizationId: string,
  documentKey: string,
  promptVersion: number | undefined,
  definitions: readonly Provision[]
) =>
  sha256Hex(
    canonicalJson({
      reuse: "vocabulary-by-definitions",
      organizationId,
      documentKey,
      promptVersion: promptVersion ?? null,
      definitions: definitions.map((provision) => provisionBlock(provision))
    })
  )

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

const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Builds a draft rulebook from uploaded documents (encoding.md, Stages 2 to 11). */
export async function buildRulebook(input: BuildInput) {
  const { ai, step, organizationId } = input
  const progress = async (stage: BuildStage, done: number, total: number) => input.progress?.(stage, done, total)
  const failures: BuildFailure[] = []
  const calls: ModelCall[] = []
  const notes: string[] = []

  const promptOptions = (prompt: PromptDefinition, stage: BuildStage) => ({
    loadPrompt: ai.loadPrompt,
    createModel: ai.createModel,
    defaultModelId: ai.modelId,
    promptVersion: ai.promptVersions[prompt.name],
    traceName: traceNames[prompt.name] ?? prompt.name,
    environment: ai.environment,
    sessionId: ai.sessionId,
    cache: ai.cache?.(stage)
  })

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
        const result = await runObjectPrompt({
          ...promptOptions(pipelinePrompts.structureRepair, "structure"),
          prompt: pipelinePrompts.structureRepair,
          schema: structureRepairAnswer,
          variables: structureRepairVariables(source.title, clean, documents, check)
        })
        const repaired = repairStructure(clean, options, { documents, check }, result.object.markers)
        return { ...repaired, calls: [callOf(source.documentId, result)] }
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
  const effectiveFrom = new Map(
    uploaded.flatMap((document) => (document.edition ? [[document.key, document.edition.effectiveFrom]] : []))
  )

  // 4. Vocabulary: one call per document with definitions; terms merge across documents by key. A document whose
  // definitions read as they did in an earlier build reuses that build's terms, so its units' prompts stay the same and
  // hit the content cache.
  const withDefinitions = structured.filter(({ documents }) =>
    documents.some((document) => document.provisions.some((provision) => provision.kind === "definition"))
  )
  await progress("vocabulary", 0, withDefinitions.length)
  const extracted = []
  for (const { source, documents } of withDefinitions) {
    const output = await step(
      `vocabulary:${source.documentId}`,
      vocabularyOutput,
      async () => {
        const provisions = documents.flatMap((document) => document.provisions)
        const definitions = provisions.filter((provision) => provision.kind === "definition")
        const options = promptOptions(pipelinePrompts.termExtraction, "vocabulary")
        const reuse = ai.cache?.("vocabulary")
        const reuseKey = await definitionsKey(organizationId, source.structure.key, options.promptVersion, definitions)
        const previous = termExtractionAnswer.safeParse(await reuse?.get(reuseKey))
        if (previous.success) {
          return { ...previous.data, isReused: true, calls: [] }
        }
        const result = await runObjectPrompt({
          ...options,
          prompt: pipelinePrompts.termExtraction,
          schema: termExtractionAnswer,
          codeFields: ownedTerms(organizationId),
          variables: termExtractionVariables(
            { key: source.structure.key, kind: source.structure.kind, title: source.title },
            definitions,
            findTermCandidates(provisions)
          )
        })
        await reuse?.put(reuseKey, result.object)
        return { ...result.object, isReused: false, calls: [callOf(source.documentId, result)] }
      },
      "model"
    )
    calls.push(...output.calls)
    notes.push(...output.notes)
    extracted.push(...output.terms)
  }
  const vocabulary = mergeTerms(organizationId, extracted).terms

  // 5. Plan: encoding units within the token budget, with their context.
  await progress("plan", 0, 1)
  const units = await step("plan", encodingUnit.array(), async () =>
    planUnits({ documents: allStructured, references, vocabulary }).filter((unit) => input.selectUnits?.(unit) ?? true)
  )
  // Every provision resolves citations; coverage counts only the encoded units' provisions (all of them in the app).
  const provisions = allStructured.flatMap((document) => document.provisions)
  const encodedKeys = new Set(units.flatMap((unit) => unit.provisions.map((provision) => provision.key)))
  const unitContext = { organizationId, documents: governing, provisions, vocabulary }
  const inScope = <I extends { code: string; recordKey: string }>(issues: readonly I[]) =>
    issues.filter((issue) => issue.code !== "coverage" || encodedKeys.has(issue.recordKey))
  const documentOf = (key: string) => governing.find((document) => document.key === key)
  const fields = (unit: EncodingUnit) =>
    draftFields(
      organizationId,
      (key) => effectiveFrom.get(key) ?? effectiveFrom.get(unit.documentKey) ?? input.now.slice(0, 10)
    )
  const verifyAnswer = (unit: EncodingUnit, answer: unknown): UnitState => ({
    unitId: unit.id,
    answer,
    ...verifyUnit(
      answer,
      unit.provisions.map((provision) => provision.key),
      unitContext
    )
  })

  // 6 to 8. Encode, verify and repair: each unit is encoded, verified alone, and repaired at once when it has problems
  // of its own, while other units are still encoding; at most `concurrency` model calls are in flight. Then the drafts
  // are merged and verified together, and round 2 repairs what only the merged set shows. A unit whose encode fails
  // after retries is recorded and left out.
  const { concurrency } = input
  const states = new Map<string, UnitState>()
  const repairs = new Map<string, number>()
  /** The valid drafts in the units' order, whatever order their calls finished in, so the merge is deterministic. */
  const drafts = () =>
    new Map(
      units.flatMap((unit) => {
        const draft = states.get(unit.id)?.draft
        return draft ? [[unit.id, draft] as const] : []
      })
    )

  /** One repair round of one unit: the model's patch, applied to the unit's answer and verified again. */
  const repairUnit = (unit: EncodingUnit, state: UnitState, problems: readonly UnitProblem[], round: number) =>
    step(
      `repair:${unit.id}:${round}`,
      repairOutput,
      async () => {
        const result = await runCheckedObjectPrompt({
          ...promptOptions(pipelinePrompts.encodingRepair, "repair"),
          prompt: pipelinePrompts.encodingRepair,
          schema: encodingPatch,
          codeFields: fields(unit),
          variables: encodingRepairVariables(state.draft ?? state.answer, problems, unit.terms)
        })
        const call = callOf(`${unit.id}:${round}`, result)
        const which = `The repair of ${unit.id} (round ${round})`
        if (!result.isValid) {
          const [issue] = result.issues
          return {
            state: null,
            call,
            notes: [`${which} sent a patch that fails Zod: ${issue?.message ?? "no answer"}.`]
          }
        }
        const applied = applyPatch(state.draft ?? state.answer, result.object)
        return {
          state: verifyAnswer(unit, applied.answer),
          call,
          notes: applied.unmatched.map((item) => `${which} names ${item}, which the draft doesn't have.`)
        }
      },
      "model"
    )

  /**
   * The state a repair leaves: a repair that breaks a valid draft, leaves it with more problems, or sent a patch that
   * fails Zod is set aside, and the draft stays with its problems, which become issues.
   */
  const settleRepair = (unit: EncodingUnit, before: UnitState, output: RepairOutput, round: number) => {
    calls.push(output.call)
    notes.push(...output.notes)
    repairs.set(unit.id, round)
    const repaired = output.state
    const isBetter =
      repaired !== null &&
      (before.draft === null || (repaired.draft !== null && repaired.problems.length <= before.problems.length))
    return isBetter ? repaired : before
  }

  let finished = 0
  await progress("encode", 0, units.length)
  const unitResults = await settleEach(units, concurrency, async (unit) => {
    const encoded = await step(
      `encode:${unit.id}`,
      encodeOutput,
      async () => {
        const document = documentOf(unit.documentKey)
        if (!document) {
          throw new Error(`Unit ${unit.id} belongs to no document.`)
        }
        const result = await runCheckedObjectPrompt({
          ...promptOptions(pipelinePrompts.provisionEncoding, "encode"),
          prompt: pipelinePrompts.provisionEncoding,
          schema: encodingDraft,
          codeFields: fields(unit),
          variables: provisionEncodingVariables(unit, document)
        })
        return { answer: result.isValid ? result.object : result.answer, call: callOf(unit.id, result) }
      },
      "model"
    )
    const verified = await step(`verify:${unit.id}`, unitState, async () => verifyAnswer(unit, encoded.answer))
    const problems = problemsToRepairAlone(verified)
    let repair: { output: RepairOutput } | { error: unknown } | null = null
    if (problems.length > 0) {
      try {
        repair = { output: await repairUnit(unit, verified, problems, 1) }
      } catch (error) {
        repair = { error }
      }
    }
    finished += 1
    await progress("encode", finished, units.length)
    return { encoded, verified, repair }
  })

  // The units' results in the units' order, so calls, notes and failures read the same on every replay.
  const verifiedAlone: UnitState[] = []
  units.forEach((unit, index) => {
    const result = unitResults[index]
    if (result?.status !== "fulfilled") {
      failures.push({ stage: "encode", itemId: unit.id, message: messageOf(result?.reason) })
      return
    }
    const { encoded, verified, repair } = result.value
    calls.push(encoded.call)
    verifiedAlone.push(verified)
    if (repair === null) {
      states.set(unit.id, verified)
    } else if ("output" in repair) {
      states.set(unit.id, settleRepair(unit, verified, repair.output, 1))
    } else {
      states.set(unit.id, verified)
      failures.push({ stage: "repair", itemId: `${unit.id}:1`, message: messageOf(repair.error) })
    }
  })
  const problemsBefore = verifiedAlone.reduce((sum, state) => sum + state.problems.length, 0)
  const validAfterEncode = verifiedAlone.filter((state) => state.draft !== null).length

  const mergeInput = (): MergeInput => ({
    organizationId,
    documents: governing,
    provisions,
    vocabulary,
    units: [...drafts()].map(([unitId, draft]) => ({ unitId, draft }))
  })
  await progress("verify", 0, 1)
  const merged = new Map(
    await step("verify:merged", unitProblems, async () => {
      const result = mergeDrafts(mergeInput())
      return [...groupByUnit(result.issues, result.sources, drafts())]
    })
  )

  // Round 2: what only the merged set shows (references no unit defines, conflicts across units), and drafts that
  // still fail Zod.
  const due = units.flatMap((unit) => {
    const state = states.get(unit.id)
    if (!state) {
      return []
    }
    const problems = state.draft ? (merged.get(unit.id) ?? []) : state.problems
    return problems.length > 0 ? [{ unit, state, problems }] : []
  })
  let repaired = 0
  await progress("repair", 0, due.length)
  const roundTwo = await settleEach(due, concurrency, async ({ unit, state, problems }) => {
    const output = await repairUnit(unit, state, problems, 2)
    repaired += 1
    await progress("repair", repaired, due.length)
    return output
  })
  due.forEach(({ unit, state }, index) => {
    const result = roundTwo[index]
    if (result?.status === "fulfilled") {
      states.set(unit.id, settleRepair(unit, state, result.value, 2))
    } else {
      failures.push({ stage: "repair", itemId: `${unit.id}:2`, message: messageOf(result?.reason) })
    }
  })
  for (const unit of units) {
    const state = states.get(unit.id)
    const [problem] = state?.draft === null ? state.problems : []
    if (problem) {
      failures.push({ stage: "repair", itemId: unit.id, message: `The draft still fails Zod: ${problem.message}` })
    }
  }
  for (const draft of drafts().values()) {
    notes.push(...draft.notes)
  }

  // 9. Merge: every valid draft into one rulebook, verified as a whole.
  await progress("merge", 0, 1)
  const mergedRulebook = await step("merge", mergeOutput, async () => {
    const { rulebook, conflicts, coverage, termPairs, issues } = mergeDrafts(mergeInput())
    const uncovered = coverage.uncovered.filter((key) => encodedKeys.has(key))
    return {
      rulebook,
      conflicts,
      coverage: { provisions: encodedKeys.size, uncovered },
      termPairs,
      issues: inScope(issues)
    }
  })

  // 10. Consolidate: duplicates, cross-unit overrides, conflicts and term merges, proposed over summaries.
  await progress("consolidate", 0, 1)
  const consolidated = await step(
    "consolidate",
    consolidateOutput,
    async () => {
      const { rulebook } = mergedRulebook
      if (rulebook.rules.length < 2) {
        return { rulebook, problems: [], issues: mergedRulebook.issues, call: null }
      }
      const result = await runObjectPrompt({
        ...promptOptions(pipelinePrompts.rulebookConsolidation, "consolidate"),
        prompt: pipelinePrompts.rulebookConsolidation,
        schema: consolidation,
        variables: rulebookConsolidationVariables(
          rulebook.rules,
          rulebook.terms,
          mergedRulebook.termPairs,
          rulebook.documents
        )
      })
      const applied = applyConsolidation(rulebook, result.object)
      return { ...applied, issues: inScope(applied.issues), call: callOf("rulebook", result) }
    },
    "model"
  )
  if (consolidated.call) {
    calls.push(consolidated.call)
  }

  const previous = (await input.previous?.()) ?? { rulebooks: [], provisions: [] }
  const content = await draftContent({
    merged: mergedRulebook,
    consolidated,
    now: input.now,
    previous: previous.rulebooks
  })
  const reviewedProvisions = await carryNoRules(
    consolidated.rulebook.provisions,
    previous.provisions,
    new Set(mergedRulebook.coverage.uncovered)
  )
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
    report: {
      units: units.map((unit) => ({
        id: unit.id,
        provisions: unit.provisions.length,
        isValid: Boolean(states.get(unit.id)?.draft),
        repairRounds: repairs.get(unit.id) ?? 0,
        problems: states.get(unit.id)?.problems.length ?? null
      })),
      validAfterEncode,
      problemsBefore,
      calls,
      notes
    }
  }
}

export type BuildResult = Awaited<ReturnType<typeof buildRulebook>>
