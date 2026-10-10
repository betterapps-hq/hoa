import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { savedCall } from "./savedRun"
import { handoff, type StepRun } from "./stage"

// A drafted step's run folder (.fixtures/eval/steps/<run id>/, written by eval-step), read back so its saved outputs
// can be scored again against fixed scorers or a regenerated dataset without calling a model (`--rescore <run>`).

/** A step item's file name in a run folder. */
export const stepItemFile = (id: string) => id.replaceAll(/[:/\\#*?"<>|]/g, "~")

const stepProblem = z.object({ itemId: z.string(), code: z.string(), message: z.string() })

/** A step run's run.json. */
export const stepRunInfo = z.object({
  runId: z.string(),
  stage: z.string(),
  from: z.string(),
  promptVersions: z.record(z.string(), z.number()).default({}),
  repeats: z.number().int().min(1).default(1),
  calls: z.array(savedCall),
  problems: z.array(stepProblem)
})
export type StepRunInfo = z.output<typeof stepRunInfo>

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"))

/**
 * A saved step run as one StepRun per repeat: each repeat's outputs for `itemIds` (null when its file is missing or
 * null), and on the first repeat the run's calls, problems and handoff (run.json doesn't say which repeat they came
 * from).
 */
export function readStepRun<Output>(
  folder: string,
  itemIds: readonly string[],
  parse: (value: unknown) => Output
): { info: StepRunInfo; runs: StepRun<Output>[] } {
  const info = stepRunInfo.parse(readJson(join(folder, "run.json")))
  const handoffPath = join(folder, "handoff.json")
  const runs = Array.from({ length: info.repeats }, (_, index): StepRun<Output> => {
    const outputs = new Map(
      itemIds.map((id) => {
        const path = join(folder, "outputs", `${index + 1}`, `${stepItemFile(id)}.json`)
        const value = existsSync(path) ? readJson(path) : null
        return [id, value === null ? null : parse(value)] as const
      })
    )
    return {
      outputs,
      calls: index === 0 ? info.calls : [],
      problems: index === 0 ? info.problems : [],
      handoff: index === 0 && existsSync(handoffPath) ? handoff.parse(readJson(handoffPath)) : {}
    }
  })
  return { info, runs }
}
