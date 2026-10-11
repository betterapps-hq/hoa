import { LangfuseClient } from "@langfuse/client"
import { env } from "@/env.server"
import { createChatModel } from "./openrouter.server"
import { createPromptLoader } from "./promptLoader"
import { startTelemetry } from "./telemetry.server"

/**
 * Everything a server function or Workflow step needs to run a prompt: a model factory with the main and small model
 * ids, the Langfuse prompt loader and tracing. Prompts live only in Langfuse, so it's required alongside OpenRouter;
 * returns the missing settings instead when either isn't configured.
 */
export function createAiContext() {
  const apiKey = env.OPENROUTER_API_KEY
  const publicKey = env.LANGFUSE_PUBLIC_KEY
  const secretKey = env.LANGFUSE_SECRET_KEY
  if (!apiKey || !publicKey || !secretKey) {
    const missing = [
      ...(apiKey ? [] : ["OPENROUTER_API_KEY"]),
      ...(publicKey ? [] : ["LANGFUSE_PUBLIC_KEY"]),
      ...(secretKey ? [] : ["LANGFUSE_SECRET_KEY"])
    ]
    return { isConfigured: false as const, missing }
  }
  const langfuseSettings = { publicKey, secretKey, baseUrl: env.LANGFUSE_BASE_URL }
  const telemetry = startTelemetry({ ...langfuseSettings, environment: env.LANGFUSE_TRACING_ENVIRONMENT })
  const langfuse = new LangfuseClient(langfuseSettings)

  return {
    isConfigured: true as const,
    createModel: (modelId: string) => createChatModel(apiKey, modelId),
    /** The main model, used when a prompt version doesn't name one. */
    modelId: env.OPENROUTER_MODEL,
    /** The cheaper model for routing, structure and classification. */
    smallModelId: env.OPENROUTER_SMALL_MODEL ?? env.OPENROUTER_MODEL,
    /** Model calls a rulebook build stage runs at once. */
    encodingConcurrency: env.ENCODING_CONCURRENCY,
    loadPrompt: createPromptLoader(
      {
        get: async (name, options) => langfuse.prompt.get(name, options),
        getChat: async (name, options) => langfuse.prompt.get(name, { ...options, type: "chat" })
      },
      env.LANGFUSE_PROMPT_LABEL
    ),
    environment: env.LANGFUSE_TRACING_ENVIRONMENT,
    /** Scores observations, such as a build's root span. */
    scores: langfuse.score,
    /** Sends buffered spans to Langfuse; call before a server function returns or a Workflow step ends. */
    flush: async () => {
      await telemetry.forceFlush()
    }
  }
}
