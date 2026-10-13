import { describe, expect, it } from "vitest"
import { demoUserId, userOf } from "./users"

describe("userOf", () => {
  it("names a demo role's user, and a Cloudflare Access identity by its email", () => {
    expect(userOf(demoUserId("administrator"))).toEqual({
      id: "demo-administrator",
      name: "Sam Rivera",
      email: "sam@example.com"
    })
    expect(userOf(demoUserId("homeowner")).name).toBe("Jordan Avery")
    expect(userOf("pat@example.org")).toEqual({
      id: "pat@example.org",
      name: "pat@example.org",
      email: "pat@example.org"
    })
  })
})
