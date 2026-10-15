import { createOpenRouter } from "@openrouter/ai-sdk-provider"

/**
 * Where a model's requests may go: only these OpenRouter providers, with no fallback to others. `dataCollection: "allow"`
 * also admits providers that may store or train on prompts; only step tests on governing documents use it.
 */
export type ProviderPin = { providers: readonly string[]; dataCollection?: "allow" | "deny" }

/**
 * A chat model on OpenRouter. Usage accounting is on so each response reports its billed cost, and data collection is
 * denied unless the pin allows it, so requests never reach providers that may store or train on prompts. A pin keeps
 * every request on the named providers, so a model served by several hosts is measured on one.
 */
export function createChatModel(apiKey: string, modelId: string, pin?: ProviderPin) {
  return createOpenRouter({ apiKey }).chat(modelId, {
    usage: { include: true },
    provider: {
      data_collection: pin?.dataCollection ?? "deny",
      ...(pin ? { only: [...pin.providers], allow_fallbacks: false } : {})
    }
  })
}
