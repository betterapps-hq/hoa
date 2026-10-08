import type { PromptLoader, PromptTemplate } from "./runPrompt"

/** The slice of `LangfuseClient.prompt` the loader uses. */
export type LangfusePromptManager = {
  get: (
    name: string,
    options: { label: string; fallback: string; type: "text" }
  ) => Promise<{
    name: string
    version: number
    isFallback: boolean
    compile: (variables?: Record<string, string>) => string
  }>
}

/**
 * Loads prompts from Langfuse by label. Langfuse falls back to the local text when it can't serve the prompt. Without
 * Langfuse credentials every prompt uses its local fallback.
 */
export function createPromptLoader(langfuse: LangfusePromptManager | undefined, label: string): PromptLoader {
  return async (prompt): Promise<PromptTemplate> => {
    if (!langfuse) {
      return {
        name: prompt.name,
        version: 0,
        isFallback: true,
        compile: (variables) => compileMustache(prompt.fallback, variables)
      }
    }
    const loaded = await langfuse.get(prompt.name, { label, fallback: prompt.fallback, type: "text" })
    return {
      name: loaded.name,
      version: loaded.version,
      isFallback: loaded.isFallback,
      compile: (variables) => loaded.compile(variables)
    }
  }
}

/** Replaces `{{variable}}` placeholders, matching Langfuse's text prompt syntax. Unknown placeholders stay as-is. */
export function compileMustache(template: string, variables: Record<string, string> = {}) {
  return template.replaceAll(/\{\{\s*([\w.-]+)\s*\}\}/g, (placeholder, key: string) => variables[key] ?? placeholder)
}
