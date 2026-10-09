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
      '"Lot": A parcel shown on the plat, with any Common Grounds it fronts.',
      "Owners may use the Common Grounds.",
      "The Board maintains the Common Grounds."
    ])
  })

  it("shortens long samples", () => {
    const long = provision("5", `Each owner keeps the Common Grounds ${"very ".repeat(60)}clean.`)
    const [candidate] = findTermCandidates([long, long, long])
    expect(candidate?.phrase).toBe("Common Grounds")
    expect(candidate?.samples[0]).toHaveLength(240)
    expect(candidate?.samples[0]?.endsWith("…")).toBe(true)
  })
})
