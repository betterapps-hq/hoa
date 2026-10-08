import { describe, expect, it, vi } from "vitest"
import { createPromptLoader, resolvePromptVersions, type LangfusePromptManager } from "./promptLoader"

const prompt = { name: "hoa-greeting" } as const

function langfuse(overrides: Partial<Awaited<ReturnType<LangfusePromptManager["get"]>>> = {}) {
  const get = vi.fn<LangfusePromptManager["get"]>(async (name) => ({
    name,
    version: 4,
    config: { model: "anthropic/claude-opus-5.5" },
    compile: (variables) => `Hi ${variables?.name ?? ""}`,
    ...overrides
  }))
  return { get }
}

describe("createPromptLoader", () => {
  it("fetches the prompt from Langfuse by label, with its config", async () => {
    const manager = langfuse()
    const template = await createPromptLoader(manager, "staging")(prompt)

    expect(manager.get).toHaveBeenCalledWith("hoa-greeting", { label: "staging", type: "text" })
    expect(template).toMatchObject({ name: "hoa-greeting", version: 4, config: { model: "anthropic/claude-opus-5.5" } })
    expect(template.compile({ name: "Sam" })).toBe("Hi Sam")
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
})

describe("resolvePromptVersions", () => {
  it("pins the labeled version of each prompt", async () => {
    const load = createPromptLoader(langfuse(), "production")
    expect(await resolvePromptVersions(load, [prompt, { name: "hoa-other" }])).toEqual({
      "hoa-greeting": 4,
      "hoa-other": 4
    })
  })
})
