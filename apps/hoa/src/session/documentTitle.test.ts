import { describe, expect, it } from "vitest"
import { documentTitle } from "./documentTitle"
import type { Session } from "./session.functions"

const user = { name: "Sam Rivera", email: "sam@example.com" }
const member: Session = {
  status: "member",
  roleId: "administrator",
  hoaName: "Sudden Valley Community Association",
  unitSystem: "imperial",
  user
}

describe("documentTitle", () => {
  it("names the page, then the association", () => {
    expect(documentTitle("People", member)).toBe("People | Sudden Valley Community Association")
  })

  it("names just the association on a page without a title", () => {
    expect(documentTitle(undefined, member)).toBe("Sudden Valley Community Association")
  })

  it("names just the page before someone joins an association", () => {
    expect(documentTitle("Sign in", { status: "signed-out", isGoogleConfigured: false })).toBe("Sign in")
    expect(documentTitle("Welcome", { status: "unaffiliated", user })).toBe("Welcome")
  })
})
