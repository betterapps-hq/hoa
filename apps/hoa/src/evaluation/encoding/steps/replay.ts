import { z } from "zod"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { runCheckedObjectPrompt, runObjectPrompt, type CodeFields, type PromptRunOptions } from "@/ai/runPrompt"
import { applyConsolidation, consolidation } from "@/encoding/consolidate"
import { findTermCandidates } from "@/encoding/definedTerms"
import { mergeTerms } from "@/encoding/merge"
import { applyPatch } from "@/encoding/patch"
import {
  encodingRepairVariables,
  provisionEncodingVariables,
  rulebookConsolidationVariables,
  termExtractionVariables
} from "@/encoding/promptVariables"
import { problemsToRepairAlone, verifyUnit } from "@/encoding/repair"
import type { StepAi } from "@/encoding/steps/run"
import { modelCallOf, type ModelCall } from "@/jobs/steps"
import { encodingDraft, encodingPatch, termDraft } from "@/schema/zod"
import type { SavedRun } from "./savedRun"

// Runs one of the naive encoder's build stages alone from a run it saved (evaluation.md, Running one step): its inputs
// are the run's saved step outputs, frozen, and its prompt the version the run used (or one pinned instead). With the
// content cache, a replay of an unchanged stage costs nothing and must give exactly the output the run saved:
// `reproduced` says whether it did, comparing the outputs as the runner writes them. The naive encoder's prompts and
// the code that filled in what they leave out live here now that the build runs the step pipeline.

export const replayStages = ["vocabulary", "encode", "repair", "consolidate"] as const

/** hoa-term-extraction's answer (encoding.md, Prompts and models). */
const termExtractionAnswer = z.object({ terms: z.array(termDraft), notes: z.array(z.string()).default([]) })

const traceNames: Record<string, string> = {
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
const ownedTerms = (organization: string): CodeFields => ({
  names: ["organizationId"],
  fill: (answer) =>
    isRecord(answer)
      ? { ...answer, terms: mapRecords(answer.terms, (term) => ({ ...term, organizationId: organization })) }
      : answer
})

/** A draft's terms belong to the organization, and its rules take effect with their main citation's document. */
function draftFields(organization: string, effectiveFrom: (documentKey: string) => string): CodeFields {
  const terms = ownedTerms(organization)
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
export type ReplayStage = (typeof replayStages)[number]

/** The organization the evaluation runner builds for. */
const organizationId = "evaluation"

/** A value as the runner writes it (writeJson), for a byte-for-byte comparison. */
export const written = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`

export type ReplayItem = { itemId: string; output: unknown; saved: unknown; reproduced: boolean; call: ModelCall }

function options(ai: StepAi, run: SavedRun, prompt: PromptRunOptions["prompt"], stage: ReplayStage) {
  return {
    loadPrompt: ai.loadPrompt,
    createModel: ai.createModel,
    defaultModelId: ai.modelId,
    prompt,
    promptVersion: ai.promptVersions[prompt.name] ?? run.info.promptVersions[prompt.name],
    traceName: traceNames[prompt.name] ?? prompt.name,
    environment: ai.environment,
    sessionId: ai.sessionId,
    cache: ai.cache?.(stage)
  }
}

const item = (itemId: string, output: unknown, saved: unknown, call: ModelCall): ReplayItem => ({
  itemId,
  output,
  saved,
  reproduced: saved !== undefined && written(output) === written(saved),
  call
})

/** The run's documents (uploads and those they name) and the date each rule takes effect, as its build had them. */
function runContext(run: SavedRun) {
  const documents = run.merge?.rulebook.documents ?? []
  const effective = new Map(
    documents.flatMap((document) => (document.edition ? [[document.key, document.edition.effectiveFrom]] : []))
  )
  return { documents, effective }
}

/** Replays a build stage over the selected items (sections, or documents for vocabulary). */
export async function replayStage(input: {
  stage: ReplayStage
  run: SavedRun
  ai: StepAi
  /** Keeps the sections (or documents) to replay; all when left out. */
  select?: (itemId: string) => boolean
}): Promise<ReplayItem[]> {
  const { stage, run, ai } = input
  const select = input.select ?? (() => true)
  const { documents, effective } = runContext(run)
  const callOf = (itemId: string, metrics: Parameters<typeof modelCallOf>[1]) =>
    modelCallOf(itemId, metrics, traceNames)
  const vocabulary = mergeTerms(
    organizationId,
    run.vocabulary.flatMap((file) => file.terms)
  ).terms
  const results: ReplayItem[] = []
  if (stage === "vocabulary") {
    for (const file of run.vocabulary.filter((saved) => select(saved.documentId))) {
      const document = documents.find((found) => found.key === file.documentId) ?? documents[0]
      const provisions = run.provisions.filter((provision) => provision.key.startsWith(`${document?.key ?? ""}:`))
      const result = await runObjectPrompt({
        ...options(ai, run, pipelinePrompts.termExtraction, stage),
        schema: termExtractionAnswer,
        codeFields: ownedTerms(organizationId),
        variables: termExtractionVariables(
          {
            key: document?.key ?? file.documentId,
            kind: document?.kind ?? "declaration",
            title: document?.title ?? ""
          },
          provisions.filter((provision) => provision.kind === "definition"),
          findTermCandidates(provisions)
        )
      })
      results.push(
        item(file.documentId, result.object, { terms: file.terms, notes: file.notes }, callOf(file.documentId, result))
      )
    }
    return results
  }
  if (stage === "consolidate") {
    const merged = run.merge
    if (!merged) {
      return []
    }
    const result = await runObjectPrompt({
      ...options(ai, run, pipelinePrompts.rulebookConsolidation, stage),
      schema: consolidation,
      variables: rulebookConsolidationVariables(
        merged.rulebook.rules,
        merged.rulebook.terms,
        merged.termPairs,
        merged.rulebook.documents
      )
    })
    const applied = applyConsolidation(merged.rulebook, result.object)
    const saved = run.consolidate
      ? { rulebook: run.consolidate.rulebook, problems: run.consolidate.problems }
      : undefined
    results.push(
      item("rulebook", { rulebook: applied.rulebook, problems: applied.problems }, saved, callOf("rulebook", result))
    )
    return results
  }
  for (const unit of run.units.filter((found) => select(found.id))) {
    const document = documents.find((found) => found.key === unit.documentKey)
    // As the build: the rule's document's date, else its section's document's (a fixed date stands in for "today").
    const fields = draftFields(
      organizationId,
      (key) => effective.get(key) ?? effective.get(unit.documentKey) ?? "2000-01-01"
    )
    if (stage === "encode") {
      if (!document) {
        continue
      }
      const result = await runCheckedObjectPrompt({
        ...options(ai, run, pipelinePrompts.provisionEncoding, stage),
        schema: encodingDraft,
        codeFields: fields,
        variables: provisionEncodingVariables(unit, document)
      })
      const answer = result.isValid ? result.object : result.answer
      results.push(item(unit.id, answer, run.encode.get(unit.id)?.answer, callOf(unit.id, result)))
      continue
    }
    const state = run.verified.get(unit.id)
    const problems = state ? problemsToRepairAlone(state) : []
    if (!state || problems.length === 0) {
      continue
    }
    const result = await runCheckedObjectPrompt({
      ...options(ai, run, pipelinePrompts.encodingRepair, stage),
      schema: encodingPatch,
      codeFields: fields,
      variables: encodingRepairVariables(state.draft ?? state.answer, problems, unit.terms)
    })
    const after = result.isValid
      ? (() => {
          const applied = applyPatch(state.draft ?? state.answer, result.object)
          return {
            unitId: unit.id,
            answer: applied.answer,
            ...verifyUnit(
              applied.answer,
              unit.provisions.map((provision) => provision.key),
              { organizationId, documents, provisions: run.provisions, vocabulary }
            )
          }
        })()
      : null
    results.push(item(`${unit.id}:1`, after, run.repairs.get(`${unit.id}:1`)?.state, callOf(`${unit.id}:1`, result)))
  }
  return results
}
