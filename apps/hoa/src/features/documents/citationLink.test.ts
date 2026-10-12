import { describe, expect, it } from "vitest"
import { citationHref, citedProvisionHref, citesOf, readerSearch } from "./citationLink"

describe("citation links", () => {
  it("opens the reader at a provision, with a rule's citations to step through", () => {
    expect(citationHref("upload 1")).toBe("/documents/upload%201")
    expect(citationHref("upload-1", "declaration:4.3(b)")).toBe(
      "/documents/upload-1?provision=declaration%3A4.3%28b%29"
    )
    expect(citationHref("upload-1", "declaration:4.3", ["declaration:4.3"])).toBe(
      "/documents/upload-1?provision=declaration%3A4.3"
    )
    expect(citationHref("upload-1", "declaration:4.3", ["declaration:4.3", "guidelines:5.1"])).toBe(
      "/documents/upload-1?provision=declaration%3A4.3&cites=declaration%3A4.3%2Cguidelines%3A5.1"
    )
  })

  it("reads a citation's document from where its text was read, or its document's key", () => {
    const anchors = [{ fileId: "upload-1" }]
    expect(citedProvisionHref({ provisionKey: "declaration:4.3", anchors })).toBe(
      "/documents/upload-1?provision=declaration%3A4.3"
    )
    expect(citedProvisionHref({ provisionKey: "guidelines:5.1", anchors: [] })).toBe(
      "/documents/guidelines?provision=guidelines%3A5.1"
    )
  })

  it("keeps only well-formed search params, and lists the citations once each", () => {
    expect(readerSearch({ provision: "declaration:4.3", cites: "a,b", other: 1 })).toEqual({
      provision: "declaration:4.3",
      cites: "a,b"
    })
    expect(readerSearch({ provision: 4, cites: "" })).toEqual({})
    expect(citesOf("a,b,,a")).toEqual(["a", "b"])
    expect(citesOf(undefined)).toEqual([])
  })
})
