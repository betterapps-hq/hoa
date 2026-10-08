import { describe, expect, it, vi } from "vitest"
import { compileMustache, createPromptLoader, type LangfusePromptManager } from "./promptLoader"

const prompt = { name: "hoa-greeting", fallback: "Hello {{ name }}" } as const

describe("createPromptLoader", () => {
  it("uses the local fallback when Langfuse isn't configured", async () => {
    const template = await createPromptLoader(undefined, "production")(prompt)

    expect(template).toMatchObject({ name: "hoa-greeting", isFallback: true })
    expect(template.compile({ name: "Avery" })).toBe("Hello Avery")
  })

  it("fetches the prompt from Langfuse by label, passing the fallback text", async () => {
    const compile = vi.fn<(variables?: Record<string, string>) => string>(() => "Hello from Langfuse")
    const get = vi.fn<LangfusePromptManager["get"]>(async () => ({
      name: "hoa-greeting",
      version: 7,
      isFallback: false,
      compile
    }))

    const template = await createPromptLoader({ get }, "staging")(prompt)

    expect(get).toHaveBeenCalledWith("hoa-greeting", { label: "staging", fallback: "Hello {{ name }}", type: "text" })
    expect(template).toMatchObject({ name: "hoa-greeting", version: 7, isFallback: false })
    expect(template.compile({ name: "Avery" })).toBe("Hello from Langfuse")
    expect(compile).toHaveBeenCalledWith({ name: "Avery" })
  })
})

describe("compileMustache", () => {
  it("replaces known placeholders and leaves unknown ones in place", () => {
    expect(compileMustache("{{a}} and {{ b }} and {{c}}", { a: "1", b: "2" })).toBe("1 and 2 and {{c}}")
  })
})
