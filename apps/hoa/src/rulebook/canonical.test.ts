// @vitest-environment node
import { describe, expect, it } from "vitest"
import { canonicalJson, sha256Hex } from "./canonical"

describe("canonicalJson", () => {
  it("sorts object keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}'
    )
  })

  it("gives the same text whatever order keys were added in, and leaves out undefined", () => {
    expect(canonicalJson({ path: ["height"], from: undefined, type: "ref" })).toBe(
      canonicalJson({ type: "ref", path: ["height"] })
    )
  })
})

describe("sha256Hex", () => {
  it("hashes the UTF-8 bytes", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(await sha256Hex("é")).not.toBe(await sha256Hex("e"))
  })
})
