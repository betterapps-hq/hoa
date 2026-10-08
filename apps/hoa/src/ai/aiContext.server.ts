import { LangfuseClient } from "@langfuse/client"
import { env } from "@/env.server"
import { createChatModel } from "./openrouter.server"
import { createPromptLoader } from "./promptLoader"
import { startTelemetry } from "./telemetry.server"

/**
 * Everything a server function needs to run a prompt: the model, the Langfuse prompt loader and tracing. Returns the
 * missing settings instead when OpenRouter isn't configured.
 */
export function createAiContext() {
  if (!env.OPENROUTER_API_KEY) {
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
    modelId: env.OPENROUTER_MODEL,
    model: createChatModel(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL),
    loadPrompt: createPromptLoader(langfuse?.prompt, env.LANGFUSE_PROMPT_LABEL),
    environment: env.LANGFUSE_TRACING_ENVIRONMENT,
    /** Sends buffered spans to Langfuse; call before a server function returns. */
    flush: async () => {
      await telemetry?.forceFlush()
    }
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
