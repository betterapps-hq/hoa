import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { z } from "zod"
import {
  analysisOutput,
  encodingUnit,
  mergeOutput,
  structureOutput,
  unitProblems,
  unitState
} from "@/encoding/stepOutputs"
import { modelCall } from "@/jobs/steps"
import { termDraft } from "@/schema/zod"

// A saved evaluation run's step outputs (.fixtures/eval/encoding/<run>/steps/*), read back as frozen inputs for one
// step and as the old pipeline's results for the datasets (evaluation.md, Datasets). Runs from earlier code differ a
// little (no prompt-cache counts on calls, one verify file for every section, no run.json), so this reader accepts
// them all.

/** A model call as any run recorded it: older runs have no prompt-cache counts. */
export const savedCall = modelCall.extend({
  cachedInputTokens: z.number().nullable().default(null),
  cacheWriteTokens: z.number().nullable().default(null)
})

const savedInfo = z.object({
  runId: z.string(),
  split: z.string(),
  units: z.string().nullable().default(null),
  promptVersions: z.record(z.string(), z.number()).default({})
})

const encodeFile = z.object({ answer: z.unknown(), call: savedCall })
const repairFile = z.object({ state: unitState.nullable(), call: savedCall, notes: z.array(z.string()).default([]) })
const vocabularyFile = z.object({
  terms: z.array(termDraft),
  notes: z.array(z.string()).default([]),
  calls: z.array(savedCall)
})
const consolidateFile = z.object({
  rulebook: mergeOutput.shape.rulebook,
  problems: z.array(z.object({ code: z.string(), recordKey: z.string(), message: z.string() })),
  issues: z.array(z.unknown()),
  call: savedCall.nullable()
})

/** A step item's file name, as the runner wrote it: colons become tildes, slashes stay folders. */
export const stepFileName = (item: string) => item.replaceAll(":", "~")

/** Reads a saved run's folder. Every part is optional except the plan and structure. */
export function readSavedRun(folder: string) {
  const steps = join(folder, "steps")
  // Runs saved before the schema dropped the `not-evaluated` reason read it as `explanatory`, the nearest reason left:
  // every requirement is now a rule, so a saved run that gave one a reason counts as having found no rule there.
  const read = (path: string): unknown =>
    JSON.parse(
      readFileSync(join(steps, path), "utf8").replaceAll(/"reason"\s*:\s*"not-evaluated"/g, '"reason":"explanatory"')
    )
  const has = (path: string) => existsSync(join(steps, path))
  const runId = basename(folder)
  const info = existsSync(join(folder, "run.json"))
    ? savedInfo.parse(JSON.parse(readFileSync(join(folder, "run.json"), "utf8")))
    : savedInfo.parse({ runId, split: runId.split("-").at(-1) ?? "all" })
  const units = encodingUnit.array().parse(read("plan/result.json"))
  const documentIds = has("structure")
    ? readdirSync(join(steps, "structure"))
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .toSorted()
    : []
  const structure = documentIds.flatMap((id) => structureOutput.parse(read(`structure/${id}.json`)).documents)
  const references = new Map<string, string[]>(
    documentIds.flatMap((id) =>
      has(`analyze/${id}.json`) ? analysisOutput.parse(read(`analyze/${id}.json`)).references : []
    )
  )
  const vocabulary = documentIds.flatMap((id) =>
    has(`vocabulary/${id}.json`) ? [{ documentId: id, ...vocabularyFile.parse(read(`vocabulary/${id}.json`)) }] : []
  )
  const encode = new Map(
    units.flatMap((unit) => {
      const path = `encode/${stepFileName(unit.id)}.json`
      return has(path) ? [[unit.id, encodeFile.parse(read(path))] as const] : []
    })
  )
  const verified = has("verify/result.json")
    ? unitState.array().parse(read("verify/result.json"))
    : units.flatMap((unit) => {
        const path = `verify/${stepFileName(unit.id)}.json`
        return has(path) ? [unitState.parse(read(path))] : []
      })
  const repairs = new Map(
    units.flatMap((unit) =>
      [1, 2].flatMap((round) => {
        const path = `repair/${stepFileName(unit.id)}~${round}.json`
        return has(path) ? [[`${unit.id}:${round}`, repairFile.parse(read(path))] as const] : []
      })
    )
  )
  return {
    runId,
    folder,
    info,
    units,
    provisions: structure.flatMap((document) => document.provisions),
    references,
    vocabulary,
    encode,
    verified: new Map(verified.map((state) => [state.unitId, state])),
    mergedProblems: has("verify/merged.json") ? new Map(unitProblems.parse(read("verify/merged.json"))) : new Map(),
    repairs,
    merge: has("merge/result.json") ? mergeOutput.parse(read("merge/result.json")) : null,
    consolidate: has("consolidate/result.json") ? consolidateFile.parse(read("consolidate/result.json")) : null,
    /** A step file as the run saved it, or null. */
    stepFile: (path: string) => (has(path) ? readFileSync(join(steps, path), "utf8") : null)
  }
}
export type SavedRun = ReturnType<typeof readSavedRun>
