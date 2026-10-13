import { describe, expect, it } from "vitest"
import { ruleKeyLabel, ruleKeyProvision, termKeyLabel } from "./applicationDisplay"

describe("termKeyLabel", () => {
  it("puts a term's key in words, without the thing it belongs to", () => {
    expect(termKeyLabel("architectural-application.review-fee-paid-on")).toBe("review fee paid on")
    expect(termKeyLabel("fence-run")).toBe("fence run")
  })
})

describe("ruleKeyLabel", () => {
  it("puts a rule's key in words, and finds the provision it names", () => {
    expect(ruleKeyLabel("guidelines:3.4.2#photos")).toBe("Photos")
    expect(ruleKeyLabel("declaration:4.3(b)/p2#written-response")).toBe("Written response")
    expect(ruleKeyProvision("declaration:4.3(b)/p2#written-response")).toBe("declaration:4.3(b)/p2")
  })

  it("leaves a key it can't read as it is", () => {
    expect(ruleKeyLabel("not-a-rule-key")).toBe("not-a-rule-key")
    expect(ruleKeyProvision("not-a-rule-key")).toBeNull()
  })
})
