import { createServerFn } from "@tanstack/react-start"
import { createAiContext, errorMessage } from "@/ai/aiContext.server"
import { prompts } from "@/ai/prompts"
import { runTextPrompt } from "@/ai/runPrompt"
import type { ModelCheckResult } from "./modelCheckResult"

/** Sends a one-line prompt through OpenRouter to confirm the model, prompt management and tracing are connected. */
export const runModelCheck = createServerFn({ method: "POST" }).handler(async (): Promise<ModelCheckResult> => {
  const ai = createAiContext()
  if (!ai.isConfigured) {
    return { status: "not-configured", missing: ai.missing }
  }
  try {
    const result = await runTextPrompt({
      loadPrompt: ai.loadPrompt,
      model: ai.model,
      prompt: prompts.modelCheck,
      traceName: "model-check",
      environment: ai.environment
    })
    return { status: "succeeded", modelId: ai.modelId, isLangfuseConfigured: ai.isLangfuseConfigured, ...result }
  } catch (error) {
    console.error("Model check failed", error)
    return { status: "failed", message: errorMessage(error, "The model check failed.") }
  } finally {
    await ai.flush()
  }
})
