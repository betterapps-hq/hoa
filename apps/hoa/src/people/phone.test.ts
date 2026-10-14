import { describe, expect, it } from "vitest"
import { optionalPhone, phoneKey, phoneText } from "./phone"

describe("phoneKey", () => {
  it("keeps a number however it's written in one form", () => {
    expect(phoneKey("360-555-0101")).toBe("+13605550101")
    expect(phoneKey("(360) 555 0101")).toBe("+13605550101")
    expect(phoneKey("+1 360.555.0101")).toBe("+13605550101")
    expect(phoneKey("+44 20 7946 0958")).toBe("+442079460958")
  })

  it("refuses text that isn't a phone number", () => {
    expect(phoneKey("555-0101")).toBeNull()
    expect(phoneKey("call me")).toBeNull()
  })
})

describe("phoneText", () => {
  it("writes a home number the way it's dialed at home, and others with their country code", () => {
    expect(phoneText("+13605550101")).toBe("(360) 555-0101")
    expect(phoneText("+442079460958")).toBe("+44 20 7946 0958")
  })

  it("leaves text it can't read as it is", () => {
    expect(phoneText("ext. 4")).toBe("ext. 4")
  })
})

describe("optionalPhone", () => {
  it("keeps nothing for an empty field", () => {
    expect(optionalPhone.parse("  ")).toBeNull()
  })

  it("says how to write a number it can't read", () => {
    expect(optionalPhone.safeParse("12").error?.issues[0]?.message).toBe("Give a phone number such as 360-555-0101.")
  })
})
