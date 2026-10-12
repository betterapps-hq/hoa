import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { z } from "zod"
import { encodingUnit, mergeOutput, structureOutput } from "@/encoding/stepOutputs"
import { modelCall } from "@/jobs/steps"

// A saved build run's step outputs (.fixtures/eval/encoding/<run>/steps/*), read back as frozen inputs for one step
// (evaluation.md, Running one step): its plan's sections, its structured provisions and its merged documents.

/** A model call as any run recorded it: older runs have no prompt-cache counts. */
export const savedCall = modelCall.extend({
  cachedInputTokens: z.number().nullable().default(null),
  cacheWriteTokens: z.number().nullable().default(null)
})

/** Reads a saved run's folder: its plan, structure and merge. */
export function readSavedRun(folder: string) {
  const steps = join(folder, "steps")
  const read = (path: string): unknown => JSON.parse(readFileSync(join(steps, path), "utf8"))
  const documentIds = readdirSync(join(steps, "structure"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .toSorted()
  const structure = documentIds.flatMap((id) => structureOutput.parse(read(`structure/${id}.json`)).documents)
  return {
    runId: basename(folder),
    units: encodingUnit.array().parse(read("plan/result.json")),
    provisions: structure.flatMap((document) => document.provisions),
    merge: mergeOutput.parse(read("merge/result.json"))
  }
}
