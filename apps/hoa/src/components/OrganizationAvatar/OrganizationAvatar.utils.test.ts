import { describe, expect, it } from "vitest"
import { organizationHue, organizationInitials } from "./OrganizationAvatar.utils"

describe("organizationInitials", () => {
  it("takes the first letters of the first two words that aren't minor ones", () => {
    expect(organizationInitials("Sudden Valley Community Association")).toBe("SV")
    expect(organizationInitials("The Highlands at Lake Whatcom")).toBe("HL")
    expect(organizationInitials("Wildwood")).toBe("W")
  })
})

describe("organizationHue", () => {
  it("gives an association the same hue every time", () => {
    expect(organizationHue("demo-hoa")).toBe(organizationHue("demo-hoa"))
    expect(organizationHue("demo-hoa")).toBeGreaterThanOrEqual(0)
    expect(organizationHue("demo-hoa")).toBeLessThan(360)
  })
})
