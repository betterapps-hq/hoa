import { describe, expect, it } from "vitest"
import type { Provision } from "@/schema/types"
import { findTermCandidates } from "./definedTerms"

const provision = (label: string, text: string, kind: Provision["kind"] = "paragraph"): Provision => ({
  key: `doc:${label}`,
  kind,
  num: null,
  label,
  heading: null,
  parentLabel: null,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null
})

const provisions = [
  provision("defs/lot", '"Lot": A parcel shown on the plat, with any Common Grounds it fronts.', "definition"),
  provision("defs/board", '"Board of Trustees" or "Board": The body that runs the Association.', "definition"),
  provision("1", 'Each owner shall follow the rules (the "House Rules"). The Lot owner pays dues.'),
  provision(
    "2",
    'Owners may use the Common Grounds. The Board maintains the Common Grounds. During the Class "B" Period the Declarant appoints the Board.'
  ),
  provision("3", 'Guests may use the Common Grounds too. Until the Class "B" Period ends, the Declarant decides.'),
  provision("4", 'After the Class "B" Period, Members vote. Common Grounds Are Open daily.')
]

describe("findTermCandidates", () => {
  const candidates = findTermCandidates(provisions)

  it("lists defined terms first, with where they're defined", () => {
    const definitions = candidates.filter((candidate) => candidate.source === "definition")
    expect(definitions.map((candidate) => [candidate.phrase, candidate.definedIn])).toEqual([
      ["Board", ["doc:defs/board"]],
      ["Board of Trustees", ["doc:defs/board"]],
      ["House Rules", ["doc:1"]],
      ["Lot", ["doc:defs/lot"]]
    ])
  })

  it("finds capitalized phrases used three times away from sentence starts, with counts and samples", () => {
    const used = candidates.filter((candidate) => candidate.source === "usage")
    expect(used.map((candidate) => [candidate.phrase, candidate.count])).toEqual([
      ["Common Grounds", 4],
      ['Class "B" Period', 3]
    ])
    expect(used[0]?.samples).toEqual([
      { provisionKey: "doc:defs/lot", text: '"Lot": A parcel shown on the plat, with any Common Grounds it fronts.' },
      { provisionKey: "doc:2", text: "Owners may use the Common Grounds." },
      { provisionKey: "doc:2", text: "The Board maintains the Common Grounds." }
    ])
  })

  it("counts a list among the provisions an inline definition opening the next paragraph is defined in", () => {
    const item = (label: string, text: string): Provision => ({
      ...provision(label, text, "point"),
      parentLabel: "9"
    })
    const listed = [
      { ...provision("9", "Owners may install only the following:"), kind: "section" as const },
      item("9(1)", "a rain barrel holding 50 gallons or less;"),
      item("9(2)", "a compost bin;"),
      {
        ...provision("9/p2", '(collectively, "Garden Fixtures") shall be screened from the street.'),
        parentLabel: "9"
      },
      {
        ...provision("10", "Owners may keep:"),
        wrapUp: '(each, a "Kept Animal") on a leash.'
      },
      { ...item("10(a)", "a dog;"), parentLabel: "10" }
    ]
    const found = findTermCandidates(listed)
    expect(found.find((candidate) => candidate.phrase === "Garden Fixtures")?.definedIn).toEqual([
      "doc:9(1)",
      "doc:9(2)",
      "doc:9/p2"
    ])
    expect(found.find((candidate) => candidate.phrase === "Kept Animal")?.definedIn).toEqual(["doc:10", "doc:10(a)"])
  })

  it("reads a section whose heading is only quoted names as their definition", () => {
    const sections = [
      { ...provision("2.1", "A parcel shown on the plat.", "section"), heading: '"Parcel"' },
      { ...provision("2.2", "The articles filed with the state.", "section"), heading: '"Charter" or "Articles":' },
      { ...provision("3.1", "Fences need approval.", "section"), heading: "Fences" }
    ]
    const defined = findTermCandidates(sections).filter((candidate) => candidate.source === "definition")
    expect(defined.map((candidate) => [candidate.phrase, candidate.definedIn])).toEqual([
      ["Articles", ["doc:2.2"]],
      ["Charter", ["doc:2.2"]],
      ["Parcel", ["doc:2.1"]]
    ])
  })

  it("shortens long samples", () => {
    const long = provision("5", `Each owner keeps the Common Grounds ${"very ".repeat(60)}clean.`)
    const [candidate] = findTermCandidates([long, long, long])
    expect(candidate?.phrase).toBe("Common Grounds")
    expect(candidate?.samples[0]?.text).toHaveLength(240)
    expect(candidate?.samples[0]?.text.endsWith("…")).toBe(true)
  })
})
