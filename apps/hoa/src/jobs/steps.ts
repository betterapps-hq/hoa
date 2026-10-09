import { z } from "zod"
import type { PromptRunMetrics } from "@/ai/runPrompt"

// What the rulebook build and the application review share about running a job: the injected step runner (Workflow
// steps in the app, plain calls in the evaluation runners and tests) and the record each model call leaves.

export type StepKind = "code" | "model"

/**
 * Runs one named step and returns its output. Outputs must survive a round trip through JSON and `schema`: a Workflow
 * stores them and reads them back on replay.
 */
export type StepRunner = <T>(name: string, schema: z.ZodType<T>, run: () => Promise<T>, kind?: StepKind) => Promise<T>

/** One model call's cost and timing, for the job's report. */
export const modelCall = z.object({
  stage: z.string(),
  itemId: z.string(),
  promptName: z.string(),
  promptVersion: z.number().int(),
  modelId: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number(),
  isCached: z.boolean()
})
export type ModelCall = z.infer<typeof modelCall>

/** A prompt run's metrics as a model call; its stage is the prompt's trace name, or the prompt's name. */
export function modelCallOf(
  itemId: string,
  metrics: PromptRunMetrics,
  traceNames: Readonly<Record<string, string>>
): ModelCall {
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
