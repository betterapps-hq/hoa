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
import type { Page } from "@/ocr/page"
import type { Edition, GoverningDocument, ProvisionKey, Rule, Term } from "@/schema/types"
import { encodingDraft, termDraft } from "@/schema/zod"
import { draftContent, type BuildFailure } from "./buildRecords"
import { checkStructure } from "./check"
import { cleanPages } from "./clean"
import { applyConsolidation, consolidation } from "./consolidate"
import { findTermCandidates } from "./definedTerms"
import { mergeDrafts, mergeTerms, type MergeInput } from "./merge"
import { planUnits, type EncodingUnit } from "./plan"
import {
  encodingRepairVariables,
  provisionEncodingVariables,
  rulebookConsolidationVariables,
  structureRepairVariables,
  termExtractionVariables
} from "./promptVariables"
import { structureDocument, type StructuredDocument } from "./provisions"
import { analyzeReferences, citedProvisions } from "./references"
import { decideRepair, groupByUnit, keysDefinedElsewhere, verifyUnit, type UnitProblem } from "./repair"
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
  type ModelCall,
  type UnitState
} from "./stepOutputs"
import { repairStructure, structureRepairAnswer } from "./structureRepair"

// The rulebook build (encoding.md, Stages 2 to 11): structure, analyze, vocabulary, plan, encode, verify, repair, merge
// and consolidate, then the draft's records. Everything it needs is injected: a step runner (Workflow steps in the app,
// plain calls in scripts and tests), the models and cache, each upload's page records and structure, and the published
// rulebook whose approvals carry forward.

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

export type StepKind = "code" | "model"

/**
 * Runs one named step and returns its output. Outputs must survive a round trip through JSON and `schema`: a Workflow
 * stores them and reads them back on replay.
 */
export type StepRunner = <T>(name: string, schema: z.ZodType<T>, run: () => Promise<T>, kind?: StepKind) => Promise<T>

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
  /** The published rulebook's records, whose approvals carry forward to unchanged records. */
  previous: { rules: readonly Rule[]; terms: readonly Term[] } | null
  /** When the records are proposed. */
  now: string
  progress?: (stage: BuildStage, done: number, total: number) => Promise<void>
  /** Encodes only the units this keeps (evaluation slices); the rest of the documents is left out of the draft. */
  selectUnits?: (unit: EncodingUnit) => boolean
  /** Encoding calls in flight at once. */
  concurrency?: number
}

const maxConcurrency = 8

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

function callOf(itemId: string, metrics: PromptRunMetrics): ModelCall {
  return {
    stage: traceNames[metrics.promptName] ?? metrics.promptName,
    itemId,
    promptName: metrics.promptName,
    promptVersion: metrics.promptVersion,
    modelId: metrics.modelId,
    inputTokens: metrics.inputTokens ?? null,
    outputTokens: metrics.outputTokens ?? null,
    costUsd: metrics.costUsd ?? null,
    latencyMs: metrics.latencyMs,
    isCached: metrics.isCached
  }
}

/** Runs `run` over `items`, at most `limit` at a time, settling each like `Promise.allSettled`. */
async function settleEach<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
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

  // 4. Vocabulary: one call per document with definitions; terms merge across documents by key.
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
        const result = await runObjectPrompt({
          ...promptOptions(pipelinePrompts.termExtraction, "vocabulary"),
          prompt: pipelinePrompts.termExtraction,
          schema: termExtractionAnswer,
          codeFields: ownedTerms(organizationId),
          variables: termExtractionVariables(
            { key: source.structure.key, kind: source.structure.kind, title: source.title },
            provisions.filter((provision) => provision.kind === "definition"),
            findTermCandidates(provisions)
          )
        })
        return { ...result.object, calls: [callOf(source.documentId, result)] }
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

  // 6. Encode: one call per unit, in parallel; a unit that fails after retries is recorded and left out.
  const concurrency = input.concurrency ?? maxConcurrency
  let encodedCount = 0
  await progress("encode", 0, units.length)
  const encodeResults = await settleEach(units, concurrency, async (unit) => {
    const output = await step(
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
    encodedCount += 1
    await progress("encode", encodedCount, units.length)
    return output
  })
  const encoded = units.flatMap((unit, index) => {
    const result = encodeResults[index]
    if (result?.status === "fulfilled") {
      calls.push(result.value.call)
      return [{ unit, answer: result.value.answer }]
    }
    failures.push({ stage: "encode", itemId: unit.id, message: messageOf(result?.reason) })
    return []
  })

  // 7. Verify: Zod and the validator on each draft, alone.
  await progress("verify", 0, encoded.length)
  const verified = await step("verify", unitState.array(), async () =>
    encoded.map(({ unit, answer }) => verifyAnswer(unit, answer))
  )
  const states = new Map(verified.map((state) => [state.unitId, state]))
  const problemsBefore = verified.reduce((sum, state) => sum + state.problems.length, 0)
  const validAfterEncode = verified.filter((state) => state.draft !== null).length
  const drafts = () =>
    new Map([...states.values()].flatMap((state) => (state.draft ? [[state.unitId, state.draft] as const] : [])))
  const repairs = new Map<string, number>()

  // 8. Repair, at most two rounds: problems a unit has alone, then those the merged rulebook shows.
  const repairRound = async (round: number, problemsOf: (state: UnitState) => UnitProblem[] | null) => {
    const due = encoded.flatMap(({ unit }) => {
      const state = states.get(unit.id)
      const problems = state ? problemsOf(state) : null
      return state && problems && problems.length > 0 ? [{ unit, state, problems }] : []
    })
    await progress("repair", 0, due.length)
    const results = await settleEach(due, concurrency, ({ unit, state, problems }) =>
      step(
        `repair:${unit.id}:${round}`,
        repairOutput,
        async () => {
          const result = await runCheckedObjectPrompt({
            ...promptOptions(pipelinePrompts.encodingRepair, "repair"),
            prompt: pipelinePrompts.encodingRepair,
            schema: encodingDraft,
            codeFields: fields(unit),
            variables: encodingRepairVariables(state.draft ?? state.answer, problems, unit.terms)
          })
          const answer = result.isValid ? result.object : result.answer
          return { state: verifyAnswer(unit, answer), call: callOf(`${unit.id}:${round}`, result) }
        },
        "model"
      )
    )
    due.forEach(({ unit }, index) => {
      const result = results[index]
      if (result?.status === "fulfilled") {
        calls.push(result.value.call)
        states.set(unit.id, result.value.state)
        repairs.set(unit.id, round)
      } else {
        failures.push({ stage: "repair", itemId: `${unit.id}:${round}`, message: messageOf(result?.reason) })
      }
    })
  }
  const mergeInput = (): MergeInput => ({
    organizationId,
    documents: governing,
    provisions,
    vocabulary,
    units: [...drafts()].map(([unitId, draft]) => ({ unitId, draft }))
  })

  await repairRound(1, (state) =>
    decideRepair(state.problems, keysDefinedElsewhere(state.unitId, drafts())) === "repair" ? state.problems : null
  )
  const merged = new Map(
    await step("verify:merged", unitProblems, async () => {
      const result = mergeDrafts(mergeInput())
      return [...groupByUnit(result.issues, result.sources, drafts())]
    })
  )
  await repairRound(2, (state) => (state.draft ? (merged.get(state.unitId) ?? null) : state.problems))
  for (const state of states.values()) {
    const [problem] = state.problems
    if (state.draft === null && problem) {
      failures.push({ stage: "repair", itemId: state.unitId, message: `The draft still fails Zod: ${problem.message}` })
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

  const content = await draftContent({
    merged: mergedRulebook,
    consolidated,
    now: input.now,
    previous: input.previous
  })
  return {
    /** The uploads' documents with their provisions, and the documents they name, for save-draft. */
    documents: structured.map(({ source }) => ({
      documentId: source.documentId,
      documents: documentsOf(source.title, source.structure, source.edition).map((document) => ({
        document,
        provisions: consolidated.rulebook.provisions.filter((provision) => provision.key.startsWith(`${document.key}:`))
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
