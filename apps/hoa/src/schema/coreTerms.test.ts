import { describe, expect, it } from "vitest"
import { coreTerms } from "./coreTerms"
import { term } from "./zod"

describe("coreTerms", () => {
  it.each(coreTerms.map((core) => [core.key, core] as const))("%s validates as a core term", (_, core) => {
    expect(term.safeParse(core).error).toBeUndefined()
    expect(core.organizationId).toBeNull()
  })

  it("has one term per key", () => {
    expect(new Set(coreTerms.map((core) => core.key)).size).toBe(coreTerms.length)
  })
})
