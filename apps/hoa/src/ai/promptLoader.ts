import { z } from "zod"
import type { PromptDefinition } from "./prompts"

/** Which version of a prompt to load: the one a label points at, or a version a job pinned. */
export type PromptSelector = { label: string } | { version: number | "fallback" }

/** A prompt version's settings in Langfuse. `model` chooses the model for that version. */
const promptConfigSchema = z.object({ model: z.string().min(1).optional() }).catch({})
export type PromptConfig = z.infer<typeof promptConfigSchema>

export type PromptTemplate = {
  name: string
  /** "fallback" when the text came from prompts.ts instead of Langfuse. */
  version: number | "fallback"
  config: PromptConfig
  compile: (variables?: Record<string, string>) => string
}

/** Loads a prompt from Langfuse prompt management, or its fallback text when Langfuse can't supply it. */
export type PromptLoader = (prompt: PromptDefinition, selector?: PromptSelector) => Promise<PromptTemplate>

/** The slice of `LangfuseClient.prompt` the loader uses. */
export type LangfusePromptManager = {
  get: (
    name: string,
    options: { label?: string; version?: number; fallback: string; type: "text" }
  ) => Promise<{
    name: string
    version: number
    isFallback: boolean
    config: unknown
    compile: (variables?: Record<string, string>) => string
  }>
}

function fallbackTemplate(prompt: PromptDefinition): PromptTemplate {
  return {
    name: prompt.name,
    version: "fallback",
    config: {},
    compile: (variables) => compileMustache(prompt.fallback, variables)
  }
}

/**
 * Loads prompts from Langfuse, by `defaultLabel` unless a selector pins a label or version. Langfuse falls back to the
 * local text when it can't serve the prompt. Without Langfuse credentials every prompt uses its local fallback.
 */
export function createPromptLoader(langfuse: LangfusePromptManager | undefined, defaultLabel: string): PromptLoader {
  return async (prompt, selector = { label: defaultLabel }): Promise<PromptTemplate> => {
    const version = "version" in selector ? selector.version : undefined
    if (!langfuse || version === "fallback") {
      return fallbackTemplate(prompt)
    }
    const options = version === undefined ? { label: "label" in selector ? selector.label : defaultLabel } : { version }
    const loaded = await langfuse.get(prompt.name, { ...options, fallback: prompt.fallback, type: "text" })
    if (loaded.isFallback) {
      return fallbackTemplate(prompt)
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

/** Replaces `{{variable}}` placeholders, matching Langfuse's text prompt syntax. Unknown placeholders stay as-is. */
export function compileMustache(template: string, variables: Record<string, string> = {}) {
  return template.replaceAll(/\{\{\s*([\w.-]+)\s*\}\}/g, (placeholder, key: string) => variables[key] ?? placeholder)
}
