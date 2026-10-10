import type { z } from "zod"
import type { PromptLoader } from "@/ai/promptLoader"
import type { PromptVariables } from "@/ai/prompts"
import { runCheckedObjectPrompt, type ModelFactory, type PromptCache } from "@/ai/runPrompt"
import { modelCallOf, type ModelCall } from "@/jobs/steps"
import { stepPrompts, stepTraceNames, type StepPromptName } from "./prompts"

// Runs one drafted step's prompt, as the build runs its prompts: by the version pinned for the run (a version no
// label points at included), traced to Langfuse, through the content cache, with an answer that fails Zod kept with
// its issues so the step's validity can be measured.

export type StepAi = {
  loadPrompt: PromptLoader
  createModel: ModelFactory
  /** `OPENROUTER_MODEL`, for a version whose config names no model. */
  modelId: string
  environment: string
  sessionId: string
  /** Pinned versions by prompt name; a prompt left out is loaded by the default label. */
  promptVersions: Readonly<Record<string, number>>
  cache?: (stage: string) => PromptCache | undefined
  /** Hard limits on a test's spend, checked before every call (`spendingLimit`). */
  budget?: Budget
}

/**
 * A test's spending limit: at most `maxCalls` model calls (an answer from the content cache isn't one), and no call
 * that could take the spend past `maxCostUsd`, judged by the dearest call so far (or `estimateUsd` before the first).
 */
export type Budget = {
  maxCalls: number
  maxCostUsd: number
  estimateUsd: number
  calls: number
  costUsd: number
  dearestUsd: number
}

export const spendingLimit = (maxCalls: number, maxCostUsd: number, estimateUsd: number): Budget => ({
  maxCalls,
  maxCostUsd,
  estimateUsd,
  calls: 0,
  costUsd: 0,
  dearestUsd: 0
})

export class BudgetExceededError extends Error {}

function checkBudget(budget: Budget | undefined) {
  if (!budget) {
    return
  }
  const next = Math.max(budget.dearestUsd, budget.estimateUsd)
  if (budget.calls >= budget.maxCalls) {
    throw new BudgetExceededError(`Stopped: ${budget.calls} model calls is the limit.`)
  }
  if (budget.costUsd + next > budget.maxCostUsd) {
    throw new BudgetExceededError(
      `Stopped: $${budget.costUsd.toFixed(4)} spent, and another call (about $${next.toFixed(2)}) could pass $${budget.maxCostUsd}.`
    )
  }
}

const traceNames = Object.fromEntries(
  (Object.keys(stepPrompts) as StepPromptName[]).map((name) => [stepPrompts[name].name, stepTraceNames[name]])
)

export type StepResult<T> =
  | { isValid: true; object: T; call: ModelCall }
  | {
      isValid: false
      answer: unknown
      issues: z.core.$ZodIssue[]
      call: ModelCall
    }

export async function runStepPrompt<N extends StepPromptName, T>(input: {
  ai: StepAi
  step: N
  itemId: string
  schema: z.ZodType<T>
  variables: PromptVariables<(typeof stepPrompts)[N]>
  /** The content cache's folder; repeats of a step use their own, so a repeat is a fresh answer. */
  cacheStage: string
}): Promise<StepResult<T>> {
  const prompt = stepPrompts[input.step]
  checkBudget(input.ai.budget)
  const result = await runCheckedObjectPrompt({
    loadPrompt: input.ai.loadPrompt,
    createModel: input.ai.createModel,
    defaultModelId: input.ai.modelId,
    prompt,
    promptVersion: input.ai.promptVersions[prompt.name],
    variables: input.variables,
    traceName: stepTraceNames[input.step],
    environment: input.ai.environment,
    sessionId: input.ai.sessionId,
    cache: input.ai.cache?.(input.cacheStage),
    schema: input.schema,
    sharedDefinitions: true
  })
  const call = modelCallOf(input.itemId, result, traceNames)
  const { budget } = input.ai
  if (budget && !call.isCached) {
    budget.calls += 1
    budget.costUsd += call.costUsd ?? budget.estimateUsd
    budget.dearestUsd = Math.max(budget.dearestUsd, call.costUsd ?? budget.estimateUsd)
  }
  return result.isValid
    ? { isValid: true, object: result.object, call }
    : { isValid: false, answer: result.answer, issues: result.issues, call }
}
