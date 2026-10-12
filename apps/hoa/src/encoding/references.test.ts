import { describe, expect, it } from "vitest"
import type { Provision } from "@/schema/types"
import type { StructuredDocument } from "./provisions"
import { analyzeReferences, citedProvisions } from "./references"

const provision = (key: string, kind: Provision["kind"], parentLabel: string | null, text = ""): Provision => ({
  key,
  kind,
  num: null,
  label: key.slice(key.indexOf(":") + 1),
  heading: null,
  parentLabel,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null
})

const declaration: StructuredDocument = {
  key: "declaration",
  provisions: [
    provision("declaration:article-3", "article", null),
    provision("declaration:3.1", "section", "article-3"),
    provision("declaration:3.1(a)", "point", "3.1"),
    provision("declaration:3.1(b)", "point", "3.1"),
    provision("declaration:article-7", "article", null),
    provision("declaration:7.4", "section", "article-7"),
    provision("declaration:7.4(a)", "point", "7.4"),
    provision("declaration:20.1", "section", null),
    provision("declaration:20.2", "section", null),
    provision("declaration:exhibit-a", "exhibit", null),
    provision("declaration:cites", "paragraph", "3.1(b)", "")
  ]
}
const rules: StructuredDocument = {
  key: "conduct-rules",
  provisions: [
    provision("conduct-rules:exhibit-c", "exhibit", null),
    provision("conduct-rules:a", "point", "exhibit-c")
  ]
}
const known = [
  { key: "declaration", names: ["Declaration"] },
  { key: "conduct-rules", names: ["Use Restrictions"] }
]

function referencesIn(text: string, citing = "declaration:cites") {
  const documents = [declaration, rules].map((document) => ({
    ...document,
    provisions: document.provisions.map((item) => (item.key === citing ? { ...item, text } : item))
  }))
  return analyzeReferences(documents, known)
}

const targets = (text: string, citing = "declaration:cites") =>
  (referencesIn(text, citing).references.get(citing) ?? []).map((reference) => [reference.text, reference.target])

describe("analyzeReferences", () => {
  it.each([
    ["as set out in Section 7.4(a)", [["7.4(a)", { type: "provision", key: "declaration:7.4(a)" }]]],
    ["under Section 3 1(a) above", [["3 1(a)", { type: "provision", key: "declaration:3.1(a)" }]]],
    ["Section 7.4(z) applies", [["7.4(z)", { type: "provision", key: "declaration:7.4" }]]],
    [
      "pursuant to Sections 20.1 and 20.2",
      [
        ["20.1", { type: "provision", key: "declaration:20.1" }],
        ["20.2", { type: "provision", key: "declaration:20.2" }]
      ]
    ],
    ["in accordance with Article 7", [["7", { type: "provision", key: "declaration:article-7" }]]],
    ["as described in Article VII", [["VII", { type: "provision", key: "declaration:article-7" }]]],
    ["subsection (a) above", [["subsection (a)", { type: "provision", key: "declaration:3.1(a)" }]]],
    ["this Section applies", [["this Section", { type: "provision", key: "declaration:3.1" }]]],
    ["this Article governs", [["this Article", { type: "provision", key: "declaration:article-3" }]]],
    ['the land in Exhibit "A"', [['Exhibit "A"', { type: "provision", key: "declaration:exhibit-a" }]]],
    ['the rules in Exhibit "C"', [['Exhibit "C"', { type: "provision", key: "conduct-rules:exhibit-c" }]]],
    ["amending this Declaration", [["this Declaration", { type: "document", key: "declaration" }]]],
    ["the Use Restrictions may change", [["the Use Restrictions", { type: "document", key: "conduct-rules" }]]],
    ["as the By-Laws provide", [["the By-Laws", { type: "document", key: "by-laws" }]]],
    [
      "Section 4.2 of the By-Laws",
      [
        ["4.2", { type: "document", key: "by-laws" }],
        ["the By-Laws", { type: "document", key: "by-laws" }]
      ]
    ],
    ["Section 9.9 is missing", [["9.9", null]]]
  ])("%s", (text, expected) => {
    expect(targets(text)).toEqual(expected)
  })

  it("resolves an article of another uploaded document it names", () => {
    const cited = targets("pursuant to Article 3 of the Declaration", "conduct-rules:a")
    expect(cited).toContainEqual(["3", { type: "provision", key: "declaration:article-3" }])
  })

  it("lists named documents that weren't uploaded once each", () => {
    const { referencedDocuments } = referencesIn(
      "the By-Laws, the Board Rules and Regulations, the Residential Design Guidelines and the By-Laws again"
    )
    expect(referencedDocuments).toEqual([
      { key: "by-laws", kind: "bylaws", title: "By-Laws" },
      { key: "board-rules-and-regulations", kind: "rules", title: "Board Rules and Regulations" },
      { key: "residential-design-guidelines", kind: "design-guidelines", title: "Residential Design Guidelines" }
    ])
  })

  it("lists the provisions a provision cites, without itself", () => {
    const { references } = referencesIn("Section 7.4 and Section 7.4(a), and this Subsection")
    expect(citedProvisions(references.get("declaration:cites") ?? [], "declaration:3.1(b)")).toEqual([
      "declaration:7.4",
      "declaration:7.4(a)"
    ])
  })
})
