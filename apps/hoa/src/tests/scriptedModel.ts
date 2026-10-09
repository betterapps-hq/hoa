import { MockLanguageModelV4 } from "ai/test"
import type { PromptLoader } from "@/ai/promptLoader"

// A model for pipeline tests that answers each call through the respond tool with whatever `answer` makes of the
// prompt's text, and a prompt loader whose text is the prompt's name and its variables, so `answer` can tell calls
// apart and read what the code sent. Tests never call a paid model.

type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0]

/** The text of a call's user messages. */
function promptText(options: CallOptions) {
  return options.prompt
    .flatMap((message) => (message.role === "user" ? message.content : []))
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}

export function scriptedModel(answer: (text: string) => unknown) {
  return new MockLanguageModelV4({
    doGenerate: async (options) => ({
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "respond",
          input: JSON.stringify(answer(promptText(options)))
        }
      ],
      finishReason: { unified: "tool-calls", raw: "tool_use" },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 }
      },
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
      warnings: []
    })
  })
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
