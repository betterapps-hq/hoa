import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test"
import type { PromptLoader } from "@/ai/promptLoader"

// Mock models for tests, which stream their answers as the app's calls read them (runPrompt.ts). `scriptedModel`
// answers each call through the respond tool with whatever `answer` makes of the prompt's text, and
// `variablesPromptLoader` is a prompt loader whose text is the prompt's name and its variables, so `answer` can tell
// calls apart and read what the code sent. Tests never call a paid model.

export type CallOptions = Parameters<MockLanguageModelV4["doStream"]>[0]
type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never

/** What a mock model answers: text, the respond tool's input, or both, with its usage and provider metadata. */
export type ModelReply = {
  text?: string
  toolInput?: unknown
  usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  providerMetadata?: Record<string, Record<string, number | Record<string, number>>>
}

/** A reply as the stream a provider sends. */
export function replyStream(reply: ModelReply): StreamResult {
  const usage = reply.usage ?? { input: 42, output: 5 }
  const cacheRead = usage.cacheRead ?? 0
  const cacheWrite = usage.cacheWrite ?? 0
  const isToolCall = reply.toolInput !== undefined
  const parts: StreamPart[] = [
    { type: "stream-start", warnings: [] },
    ...(reply.text === undefined
      ? []
      : ([
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: reply.text },
          { type: "text-end", id: "text-1" }
        ] as const)),
    ...(isToolCall
      ? [
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "respond",
            input: JSON.stringify(reply.toolInput)
          }
        ]
      : []),
    {
      type: "finish",
      finishReason: isToolCall ? { unified: "tool-calls", raw: "tool_use" } : { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: usage.input, noCache: usage.input - cacheRead - cacheWrite, cacheRead, cacheWrite },
        outputTokens: { total: usage.output, text: usage.output, reasoning: 0 }
      },
      ...(reply.providerMetadata ? { providerMetadata: reply.providerMetadata } : {})
    }
  ]
  return { stream: convertArrayToReadableStream(parts) }
}

/** A model that streams `reply`, or what `reply` makes of each call. */
export function replyingModel(reply: ModelReply | ((options: CallOptions) => ModelReply | Promise<ModelReply>)) {
  return new MockLanguageModelV4({
    doStream: async (options) => replyStream(typeof reply === "function" ? await reply(options) : reply)
  })
}

/** The text of a call's user messages: the prompt's parts (its shared prefix and the rest) joined as compiled. */
export function promptText(options: CallOptions) {
  return options.prompt
    .flatMap((message) => (message.role === "user" ? message.content : []))
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
}

export function scriptedModel(answer: (text: string) => unknown) {
  return replyingModel((options) => ({
    toolInput: answer(promptText(options)),
    usage: { input: 100, output: 10 },
    providerMetadata: { openrouter: { usage: { cost: 0.01 } } }
  }))
}

/** Prompts whose text is `# {name}` and then each variable as `## {variable}` with its value. */
export const variablesPromptLoader: PromptLoader = async (prompt) => ({
  name: prompt.name,
  version: 1,
  config: {},
  compile: (variables) =>
    [`# ${prompt.name}`, ...Object.entries(variables ?? {}).map(([name, value]) => `## ${name}\n${value}`)].join("\n")
})

/** One variable's value from a prompt `variablesPromptLoader` compiled. */
export function variableOf(text: string, name: string) {
  const start = text.indexOf(`## ${name}\n`)
  if (start < 0) {
    return ""
  }
  const rest = text.slice(start + name.length + 4)
  const end = rest.search(/\n## [A-Za-z]+\n/)
  return end < 0 ? rest : rest.slice(0, end)
}
