import { describe, expect, it } from "vitest"
import { listNames, sentenceCase } from "./text"

describe("sentenceCase", () => {
  it("capitalizes the first letter and keeps the rest as written", () => {
    expect(sentenceCase("front yard")).toBe("Front yard")
    expect(sentenceCase("CC&Rs amendment")).toBe("CC&Rs amendment")
  })
})

describe("listNames", () => {
  it("joins names in a sentence", () => {
    expect(listNames([])).toBe("")
    expect(listNames(["a"])).toBe("a")
    expect(listNames(["a", "b", "c"])).toBe("a, b and c")
  })
})
