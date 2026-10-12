import { describe, expect, it } from "vitest"
import { ruleKeyLabel, termKeyLabel } from "./applicationDisplay"

describe("termKeyLabel", () => {
  it("puts a term's key in words, without the thing it belongs to", () => {
    expect(termKeyLabel("architectural-application.review-fee-paid-on")).toBe("review fee paid on")
    expect(termKeyLabel("fence-run")).toBe("fence run")
  })
})

describe("ruleKeyLabel", () => {
  it("puts a rule's key in words: its name, then the provision it cites", () => {
    expect(ruleKeyLabel("guidelines:3.4.2#photos")).toBe("Photos (Guidelines 3.4.2)")
    expect(ruleKeyLabel("declaration:4.3(b)/p2#written-response")).toBe(
      "Written response (Declaration 4.3(b), paragraph 2)"
    )
    expect(ruleKeyLabel("use-restrictions:article-4#approval-required")).toBe(
      "Approval required (Use restrictions Article 4)"
    )
  })

  it("leaves a key it can't read as it is", () => {
    expect(ruleKeyLabel("not-a-rule-key")).toBe("not-a-rule-key")
  })
})
