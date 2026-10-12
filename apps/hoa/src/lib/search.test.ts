import { describe, expect, it } from "vitest"
import { createSearch, fuzziness } from "./search"

type Item = { id: string; title: string; body: string; area: string }

const items: Item[] = [
  { id: "height", title: "Fence height", body: "A fence may be at most six feet tall.", area: "yard" },
  {
    id: "colors",
    title: "Paint colors",
    body: "Exterior paint needs approval; fences are stained, not painted.",
    area: "house"
  },
  { id: "pools", title: "Swimming pools", body: "A pool needs a barrier around it.", area: "yard" },
  { id: "facade", title: "Façade materials", body: "Brick or stone on the front elevation.", area: "house" },
  { id: "permit", title: "Permits", body: "Approval number 2024 is kept on file.", area: "house" }
]

const search = createSearch(items, {
  id: (item) => item.id,
  fields: { title: { text: (item) => item.title, boost: 3 }, body: { text: (item) => item.body } }
})

describe("createSearch", () => {
  it("finds nothing to rank for a blank query, and keeps the items in their order", () => {
    expect(search.ids("  ")).toBeNull()
    expect(search.rank(items, "").map((item) => item.id)).toEqual(items.map((item) => item.id))
  })

  it("tolerates a typo in a longer word", () => {
    expect(search.ids("fense")).toContain("height")
    expect(search.ids("aproval")).toEqual(expect.arrayContaining(["colors", "permit"]))
  })

  it("matches every word as a prefix", () => {
    expect(search.ids("swim")).toEqual(["pools"])
    expect(search.ids("barr")).toEqual(["pools"])
  })

  it("matches another form of a word", () => {
    expect(search.ids("fences")).toEqual(expect.arrayContaining(["height", "colors"]))
    expect(search.ids("pool")).toEqual(["pools"])
  })

  it("matches the words in any order, and narrows with every word", () => {
    expect(search.ids("tall fence")).toEqual(["height"])
    expect(search.ids("fence tall")).toEqual(["height"])
    expect(search.ids("fence pool")).toEqual([])
  })

  it("ranks a title match above a body match", () => {
    expect(search.ids("fence")?.[0]).toBe("height")
    expect(search.ids("paint")).toEqual(["colors"])
    expect(search.ids("approval")?.[0]).toBe("permit")
  })

  it("ignores accents and common words, unless the query is only common words", () => {
    expect(search.ids("facade")).toEqual(["facade"])
    expect(search.ids("the swimming pools")).toEqual(["pools"])
    expect(search.ids("or")).toEqual(["facade"])
  })

  it("matches numbers and short words exactly", () => {
    expect(fuzziness("pool")).toBe(1)
    expect(fuzziness("approval")).toBe(2)
    expect(fuzziness("six")).toBe(0)
    expect(fuzziness("2025")).toBe(0)
    expect(search.ids("2025")).toEqual([])
    expect(search.ids("2024")).toEqual(["permit"])
  })

  it("ranks only the items a filter kept", () => {
    const inYard = items.filter((item) => item.area === "yard")
    expect(search.rank(inYard, "fence").map((item) => item.id)).toEqual(["height"])
    expect(search.rank(inYard, "barrier").map((item) => item.id)).toEqual(["pools"])
    expect(search.rank(inYard, "paint")).toEqual([])
  })
})
