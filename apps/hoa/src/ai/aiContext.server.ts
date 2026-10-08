import { LangfuseClient } from "@langfuse/client"
import { env } from "@/env.server"
import { createChatModel } from "./openrouter.server"
import { createPromptLoader } from "./promptLoader"
import { startTelemetry } from "./telemetry.server"

/**
 * Everything a server function or Workflow step needs to run a prompt: a model factory with the main and small model
 * ids, the Langfuse prompt loader and tracing. Returns the missing settings instead when OpenRouter isn't configured.
 */
export function createAiContext() {
  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { isConfigured: false as const, missing: ["OPENROUTER_API_KEY"] }
  }
  const langfuseSettings =
    env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
      ? { publicKey: env.LANGFUSE_PUBLIC_KEY, secretKey: env.LANGFUSE_SECRET_KEY, baseUrl: env.LANGFUSE_BASE_URL }
      : undefined
  const telemetry = langfuseSettings
    ? startTelemetry({ ...langfuseSettings, environment: env.LANGFUSE_TRACING_ENVIRONMENT })
    : undefined
  const langfuse = langfuseSettings ? new LangfuseClient(langfuseSettings) : undefined

  return {
    isConfigured: true as const,
    isLangfuseConfigured: Boolean(langfuse),
    createModel: (modelId: string) => createChatModel(apiKey, modelId),
    /** The main model, used when a prompt version doesn't name one. */
    modelId: env.OPENROUTER_MODEL,
    /** The cheaper model for routing, structure and classification. */
    smallModelId: env.OPENROUTER_SMALL_MODEL ?? env.OPENROUTER_MODEL,
    loadPrompt: createPromptLoader(langfuse?.prompt, env.LANGFUSE_PROMPT_LABEL),
    environment: env.LANGFUSE_TRACING_ENVIRONMENT,
    /** Sends buffered spans to Langfuse; call before a server function returns or a Workflow step ends. */
    flush: async () => {
      await telemetry?.forceFlush()
    }
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
