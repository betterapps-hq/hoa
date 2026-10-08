import { describe, expect, it, vi } from "vitest"
import { compileMustache, createPromptLoader, resolvePromptVersions, type LangfusePromptManager } from "./promptLoader"

const prompt = { name: "hoa-greeting", fallback: "Hello {{ name }}" } as const

function langfuse(overrides: Partial<Awaited<ReturnType<LangfusePromptManager["get"]>>> = {}) {
  const compile = vi.fn<(variables?: Record<string, string>) => string>(() => "Hello from Langfuse")
  const get = vi.fn<LangfusePromptManager["get"]>(async () => ({
    name: "hoa-greeting",
    version: 7,
    isFallback: false,
    config: { model: "anthropic/claude-sonnet-5.5", temperature: 0 },
    compile,
    ...overrides
  }))
  return { get, compile }
}

describe("createPromptLoader", () => {
  it("uses the local fallback when Langfuse isn't configured", async () => {
    const template = await createPromptLoader(undefined, "production")(prompt)

    expect(template).toMatchObject({ name: "hoa-greeting", version: "fallback", config: {} })
    expect(template.compile({ name: "Avery" })).toBe("Hello Avery")
  })

  it("fetches the prompt from Langfuse by label, with its config and the fallback text", async () => {
    const { get, compile } = langfuse()
    const template = await createPromptLoader({ get }, "staging")(prompt)

    expect(get).toHaveBeenCalledWith("hoa-greeting", { label: "staging", fallback: "Hello {{ name }}", type: "text" })
    expect(template).toMatchObject({
      name: "hoa-greeting",
      version: 7,
      config: { model: "anthropic/claude-sonnet-5.5" }
    })
    expect(template.compile({ name: "Avery" })).toBe("Hello from Langfuse")
    expect(compile).toHaveBeenCalledWith({ name: "Avery" })
  })

  it("loads a pinned version, and a pinned fallback without calling Langfuse", async () => {
    const { get } = langfuse()
    const load = createPromptLoader({ get }, "production")

    await load(prompt, { version: 7 })
    expect(get).toHaveBeenCalledWith("hoa-greeting", { version: 7, fallback: "Hello {{ name }}", type: "text" })

    get.mockClear()
    expect((await load(prompt, { version: "fallback" })).version).toBe("fallback")
    expect(get).not.toHaveBeenCalled()
  })

  it("reports Langfuse's own fallback as a fallback, and ignores an unusable config", async () => {
    const fallback = await createPromptLoader(langfuse({ isFallback: true }), "production")(prompt)
    expect(fallback.version).toBe("fallback")

    const oddConfig = await createPromptLoader(langfuse({ config: { model: 42 } }), "production")(prompt)
    expect(oddConfig.config).toEqual({})
  })
})

describe("resolvePromptVersions", () => {
  it("pins the version each prompt's label points at", async () => {
    const load = createPromptLoader(langfuse(), "production")
    expect(await resolvePromptVersions(load, [prompt])).toEqual({ "hoa-greeting": 7 })
    expect(await resolvePromptVersions(createPromptLoader(undefined, "production"), [prompt])).toEqual({
      "hoa-greeting": "fallback"
    })
  })
})

describe("compileMustache", () => {
  it("replaces known placeholders and leaves unknown ones in place", () => {
    expect(compileMustache("{{a}} and {{ b }} and {{c}}", { a: "1", b: "2" })).toBe("1 and 2 and {{c}}")
  })
})
