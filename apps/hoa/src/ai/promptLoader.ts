import { z } from "zod"
import type { PromptDefinition } from "./prompts"

/** Which version of a prompt to load: the one a label points at, or a version a job pinned. */
export type PromptSelector = { label: string } | { version: number }

/**
 * A prompt version's settings in Langfuse. `model` chooses the model for that version, and `effort` how much it
 * reasons before answering (OpenRouter's `reasoning.effort`); without it the model's default applies. `provider` keeps
 * the version's calls on one OpenRouter provider or tier (such as `openai/fast`), with no fallback. `escalationModel`
 * is the stronger model a stage escalates a disputed answer to (the review's facts: application-review.md,
 * Recognition).
 */
export const promptEffort = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"])
const promptConfigSchema = z
  .object({
    model: z.string().min(1).optional(),
    effort: promptEffort.optional(),
    provider: z.string().min(1).optional(),
    escalationModel: z.string().min(1).optional()
  })
  .catch({})
export type PromptConfig = z.infer<typeof promptConfigSchema>

/** One message of a chat prompt. */
export type PromptMessage = { role: "system" | "user"; content: string }

export type PromptTemplate = {
  name: string
  version: number
  config: PromptConfig
  /** The prompt's text with its variables filled in; a chat prompt's messages joined in order. */
  compile: (variables?: Record<string, string>) => string
  /** A chat prompt's messages, with its variables filled in; absent for a text prompt. */
  messages?: (variables?: Record<string, string>) => PromptMessage[]
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
    prompt: string
    config: unknown
    compile: (variables?: Record<string, string>) => string
  }>
  /** A chat prompt (`get` with `type: "chat"`), for the prompts whose definitions say they're chat prompts. */
  getChat?: (
    name: string,
    options: { label?: string; version?: number }
  ) => Promise<{
    name: string
    version: number
    prompt: readonly unknown[]
    config: unknown
    compile: (variables?: Record<string, string>) => readonly unknown[]
  }>
}

const chatMessages = z.array(z.object({ role: z.enum(["system", "user"]), content: z.string() }))

/** The `{{variables}}` a prompt's text uses. */
export function promptVariables(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1] ?? ""))]
}

/**
 * Why a Langfuse prompt version doesn't fit the code's contract, or null when it does. The text must use exactly the
 * variables the code fills in: an extra one would reach the model as a literal placeholder, and a missing one means
 * data the code sends never reaches it.
 */
export function contractProblem(definition: PromptDefinition, text: string) {
  const used = promptVariables(text)
  const unfilled = used.filter((name) => !definition.variables.includes(name))
  const unused = definition.variables.filter((name) => !used.includes(name))
  const problems = [
    ...(unfilled.length > 0
      ? [`uses ${unfilled.map((name) => `{{${name}}}`).join(", ")}, which the code doesn't fill in`]
      : []),
    ...(unused.length > 0 ? [`doesn't use ${unused.map((name) => `{{${name}}}`).join(", ")}`] : [])
  ]
  return problems.length > 0 ? problems.join("; it ") : null
}

/**
 * Loads prompts from Langfuse, by `defaultLabel` unless a selector pins a label or version. Prompts exist only in
 * Langfuse, so a prompt Langfuse can't serve, or a version whose variables don't match the code, fails the call.
 */
export function createPromptLoader(langfuse: LangfusePromptManager, defaultLabel: string): PromptLoader {
  return async (prompt, selector = { label: defaultLabel }): Promise<PromptTemplate> => {
    const options = "version" in selector ? { version: selector.version } : { label: selector.label }
    const which = "version" in options ? `version ${options.version}` : `label "${options.label}"`
    const fetch = async () => {
      if (!prompt.chat) {
        return { kind: "text" as const, loaded: await langfuse.get(prompt.name, { ...options, type: "text" }) }
      }
      if (!langfuse.getChat) {
        throw new Error("this loader serves text prompts only")
      }
      return { kind: "chat" as const, loaded: await langfuse.getChat(prompt.name, options) }
    }
    let fetched: Awaited<ReturnType<typeof fetch>>
    try {
      fetched = await fetch()
    } catch (error) {
      throw new Error(`Langfuse couldn't serve the prompt ${prompt.name} (${which}).`, { cause: error })
    }
    const { loaded } = fetched
    const base = { name: loaded.name, version: loaded.version, config: promptConfigSchema.parse(loaded.config) }
    if (fetched.kind === "text") {
      const problem = contractProblem(prompt, fetched.loaded.prompt)
      if (problem) {
        throw new Error(
          `Langfuse prompt ${prompt.name} version ${loaded.version} doesn't match the code: it ${problem}.`
        )
      }
      const text = fetched.loaded
      return { ...base, compile: (variables) => text.compile(variables) }
    }
    const template = chatMessages.safeParse(fetched.loaded.prompt)
    if (!template.success) {
      throw new Error(
        `Langfuse prompt ${prompt.name} version ${loaded.version} isn't a chat of system and user messages.`
      )
    }
    const problem = contractProblem(prompt, template.data.map((message) => message.content).join("\n"))
    if (problem) {
      throw new Error(`Langfuse prompt ${prompt.name} version ${loaded.version} doesn't match the code: it ${problem}.`)
    }
    const chat = fetched.loaded
    const messages = (variables?: Record<string, string>) => chatMessages.parse(chat.compile(variables))
    return {
      ...base,
      messages,
      compile: (variables) =>
        messages(variables)
          .map((message) => message.content)
          .join("\n")
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
