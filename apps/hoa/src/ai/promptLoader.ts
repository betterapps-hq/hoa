import { z } from "zod"
import type { PromptDefinition } from "./prompts"

/** Which version of a prompt to load: the one a label points at, or a version a job pinned. */
export type PromptSelector = { label: string } | { version: number }

/** A prompt version's settings in Langfuse. `model` chooses the model for that version. */
const promptConfigSchema = z.object({ model: z.string().min(1).optional() }).catch({})
export type PromptConfig = z.infer<typeof promptConfigSchema>

export type PromptTemplate = {
  name: string
  version: number
  config: PromptConfig
  compile: (variables?: Record<string, string>) => string
}

/** Loads a prompt version from Langfuse prompt management. */
export type PromptLoader = (prompt: PromptDefinition, selector?: PromptSelector) => Promise<PromptTemplate>

/** The slice of `LangfuseClient.prompt` the loader uses. */
export type LangfusePromptManager = {
  get: (
    name: string,
    options: { label?: string; version?: number; type: "text" }
  ) => Promise<{
    name: string
    version: number
    config: unknown
    compile: (variables?: Record<string, string>) => string
  }>
}

/**
 * Loads prompts from Langfuse, by `defaultLabel` unless a selector pins a label or version. Prompts exist only in
 * Langfuse, so a prompt Langfuse can't serve fails the call with its name and label.
 */
export function createPromptLoader(langfuse: LangfusePromptManager, defaultLabel: string): PromptLoader {
  return async (prompt, selector = { label: defaultLabel }): Promise<PromptTemplate> => {
    const options = "version" in selector ? { version: selector.version } : { label: selector.label }
    let loaded: Awaited<ReturnType<LangfusePromptManager["get"]>>
    try {
      loaded = await langfuse.get(prompt.name, { ...options, type: "text" })
    } catch (error) {
      const which = "version" in options ? `version ${options.version}` : `label "${options.label}"`
      throw new Error(`Langfuse couldn't serve the prompt ${prompt.name} (${which}).`, { cause: error })
    }
    return {
      name: loaded.name,
      version: loaded.version,
      config: promptConfigSchema.parse(loaded.config),
      compile: (variables) => loaded.compile(variables)
    }
  }
}

/**
 * Pins the current version of each prompt, so every step of a job uses the same versions even if a label moves while
 * it runs (docs/design/platform.md, "Caching").
 */
export async function resolvePromptVersions(loadPrompt: PromptLoader, prompts: readonly PromptDefinition[]) {
  const entries = await Promise.all(
    prompts.map(async (prompt) => [prompt.name, (await loadPrompt(prompt)).version] as const)
  )
  return Object.fromEntries(entries)
}
