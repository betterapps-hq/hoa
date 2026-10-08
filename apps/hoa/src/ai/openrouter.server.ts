import { createOpenRouter } from "@openrouter/ai-sdk-provider"

/**
 * A chat model on OpenRouter. Usage accounting is on so each response reports its billed cost, and data collection is
 * denied so requests never reach providers that may store or train on prompts.
 */
export function createChatModel(apiKey: string, modelId: string) {
  return createOpenRouter({ apiKey }).chat(modelId, {
    usage: { include: true },
    provider: { data_collection: "deny" }
  })
}
