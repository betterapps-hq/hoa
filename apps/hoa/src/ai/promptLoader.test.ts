import { describe, expect, it, vi } from "vitest"
import {
  contractProblem,
  createPromptLoader,
  promptVariables,
  resolvePromptVersions,
  type LangfusePromptManager
} from "./promptLoader"

const prompt = { name: "hoa-greeting", variables: ["name"] } as const

function langfuse(overrides: Partial<Awaited<ReturnType<LangfusePromptManager["get"]>>> = {}) {
  const get = vi.fn<LangfusePromptManager["get"]>(async (name) => ({
    name,
    version: 4,
    prompt: "Hi {{name}}",
    config: { model: "anthropic/claude-opus-5.5" },
    compile: (variables) => `Hi ${variables?.name ?? ""}`,
    ...overrides
  }))
  return { get }
}

describe("createPromptLoader", () => {
  it("fetches the prompt from Langfuse by label, with its config", async () => {
    const manager = langfuse()
    const template = await createPromptLoader(manager, "development")(prompt)

    expect(manager.get).toHaveBeenCalledWith("hoa-greeting", { label: "development", type: "text" })
    expect(template).toMatchObject({ name: "hoa-greeting", version: 4, config: { model: "anthropic/claude-opus-5.5" } })
    expect(template.compile({ name: "Sam" })).toBe("Hi Sam")
  })

  it("reads a version's reasoning effort", async () => {
    const manager = langfuse({ config: { model: "anthropic/claude-haiku-5.5", effort: "high" } })
    const template = await createPromptLoader(manager, "production")(prompt)
    expect(template.config).toEqual({ model: "anthropic/claude-haiku-5.5", effort: "high" })
  })

  it("loads a pinned version, and ignores an unusable config", async () => {
    const manager = langfuse({ config: { model: 7 } })
    const template = await createPromptLoader(manager, "production")(prompt, { version: 7 })

    expect(manager.get).toHaveBeenCalledWith("hoa-greeting", { version: 7, type: "text" })
    expect(template.config).toEqual({})
  })

  it("fails with the prompt and label when Langfuse can't serve it", async () => {
    const manager = {
      get: vi.fn<LangfusePromptManager["get"]>(async () => {
        throw new Error("404")
      })
    }
    const load = createPromptLoader(manager, "production")

    await expect(load(prompt)).rejects.toThrow('Langfuse couldn\'t serve the prompt hoa-greeting (label "production").')
    await expect(load(prompt, { version: 3 })).rejects.toThrow("hoa-greeting (version 3)")
  })

  it("refuses a version whose variables don't match the code", async () => {
    const load = createPromptLoader(langfuse({ prompt: "Hi {{fullName}}" }), "production")
    await expect(load(prompt)).rejects.toThrow(
      "Langfuse prompt hoa-greeting version 4 doesn't match the code: it uses {{fullName}}, which the code doesn't fill in; it doesn't use {{name}}."
    )
  })
})

describe("chat prompts", () => {
  const chat = { name: "hoa-chat", variables: ["name"], chat: true } as const

  function chatManager(prompt: unknown[]) {
    return {
      get: vi.fn<LangfusePromptManager["get"]>(),
      getChat: vi.fn<NonNullable<LangfusePromptManager["getChat"]>>(async (name) => ({
        name,
        version: 2,
        prompt,
        config: {},
        compile: (variables) => [
          { role: "system", content: "Greet people." },
          { role: "user", content: `<name>${variables?.name ?? ""}</name>` }
        ]
      }))
    }
  }

  it("loads a chat prompt's messages and checks the variables across them", async () => {
    const manager = chatManager([
      { role: "system", content: "Greet people." },
      { role: "user", content: "<name>{{name}}</name>" }
    ])
    const template = await createPromptLoader(manager, "development")(chat, { version: 2 })
    expect(manager.getChat).toHaveBeenCalledWith("hoa-chat", { version: 2 })
    expect(manager.get).not.toHaveBeenCalled()
    expect(template.messages?.({ name: "Sam" })).toEqual([
      { role: "system", content: "Greet people." },
      { role: "user", content: "<name>Sam</name>" }
    ])
    expect(template.compile({ name: "Sam" })).toBe("Greet people.\n<name>Sam</name>")
  })

  it("refuses a chat whose variables don't match, one that isn't system and user messages, and a text-only loader", async () => {
    await expect(
      createPromptLoader(chatManager([{ role: "user", content: "Hi" }]), "production")(chat)
    ).rejects.toThrow("doesn't use {{name}}")
    await expect(
      createPromptLoader(chatManager([{ type: "placeholder", name: "history" }]), "production")(chat)
    ).rejects.toThrow("isn't a chat of system and user messages")
    await expect(createPromptLoader(langfuse(), "production")(chat)).rejects.toThrow(
      "couldn't serve the prompt hoa-chat"
    )
  })
})

describe("prompt contract", () => {
  it("reads a prompt's variables and compares them with the code's", () => {
    expect(promptVariables("{{a}} and {{ b }} and {{a}}")).toEqual(["a", "b"])
    expect(contractProblem({ name: "x", variables: ["a", "b"] }, "{{ b }} {{a}}")).toBeNull()
    expect(contractProblem({ name: "x", variables: ["a"] }, "Nothing here")).toBe("doesn't use {{a}}")
    expect(contractProblem({ name: "x", variables: [] }, "{{a}}")).toBe("uses {{a}}, which the code doesn't fill in")
  })
})

describe("resolvePromptVersions", () => {
  it("pins the labeled version of each prompt", async () => {
    const load = createPromptLoader(langfuse(), "production")
    expect(await resolvePromptVersions(load, [prompt, { name: "hoa-other", variables: ["name"] }])).toEqual({
      "hoa-greeting": 4,
      "hoa-other": 4
    })
  })
})
