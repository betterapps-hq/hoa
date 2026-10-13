import { describe, expect, it } from "vitest"
import { counted, listNames, sentenceCase } from "./text"

describe("sentenceCase", () => {
  it("capitalizes the first letter and keeps the rest as written", () => {
    expect(sentenceCase("front yard")).toBe("Front yard")
    expect(sentenceCase("CC&Rs amendment")).toBe("CC&Rs amendment")
  })
})

describe("counted", () => {
  it("says a count with its noun", () => {
    expect(counted(1, "rule", "rules")).toBe("1 rule")
    expect(counted(0, "rule", "rules")).toBe("0 rules")
    expect(counted(12, "rule", "rules")).toBe("12 rules")
  })
})

describe("listNames", () => {
  it("joins names in a sentence", () => {
    expect(listNames([])).toBe("")
    expect(listNames(["a"])).toBe("a")
    expect(listNames(["a", "b", "c"])).toBe("a, b and c")
  })
})
