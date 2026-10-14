import { describe, expect, it } from "vitest"
import { initialsOf } from "./users"

describe("initialsOf", () => {
  it("takes the first letters of a name's first and last words, or of the email without a name", () => {
    expect(initialsOf("Sam Rivera", "sam@example.com")).toBe("SR")
    expect(initialsOf("Jordan  Lee Avery ", "jordan@example.com")).toBe("JA")
    expect(initialsOf("Cher", "cher@example.com")).toBe("C")
    expect(initialsOf("", "pat@example.com")).toBe("P")
  })
})
