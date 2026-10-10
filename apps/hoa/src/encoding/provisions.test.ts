import { describe, expect, it } from "vitest"
import { provision as provisionSchema } from "@/schema/zod"
import { pagesOf, syntheticPages } from "@/tests/syntheticDeclaration"
import { cleanPages } from "./clean"
import { definedNames, definitionSlug, splitHeading, structureDocument } from "./provisions"

const documents = structureDocument(cleanPages(syntheticPages()), {
  documentKey: "declaration",
  fileId: "file-1",
  exhibitDocuments: { A: "conduct-rules" }
})
const [declaration, exhibit] = documents
const find = (key: string) => documents.flatMap((document) => document.provisions).find((item) => item.key === key)

describe("structureDocument", () => {
  it("keys and labels every provision per the schema's conventions", () => {
    expect(declaration?.provisions.map((provision) => provision.label)).toEqual([
      "preamble",
      "part-one",
      "article-1",
      "1.1",
      "1.1/p1",
      "1.1/p2",
      "1.2",
      "article-2",
      "article-2/p1",
      "article-2/lot",
      "article-2/board-of-trustees",
      "article-2/design-code",
      "article-2/bp",
      "article-2/bp(a)",
      "article-2/bp(b)",
      "article-2/common-grounds",
      "article-3",
      "3.1",
      "3.1(a)",
      "3.1(a)(i)",
      "3.1(a)(ii)",
      "3.1(a)(iii)",
      "3.1(a)/p2",
      "3.1(b)",
      "3.2",
      "execution"
    ])
    expect(declaration?.provisions.every((provision) => provision.key === `declaration:${provision.label}`)).toBe(true)
  })

  it("makes a marked exhibit a document of its own, labeled from its root", () => {
    expect(exhibit?.key).toBe("conduct-rules")
    expect(exhibit?.provisions.map((provision) => [provision.label, provision.parentLabel])).toEqual([
      ["exhibit-a", null],
      ["p1", "exhibit-a"],
      ["a", "exhibit-a"],
      ["b", "exhibit-a"]
    ])
    expect(find("conduct-rules:exhibit-a")).toMatchObject({ kind: "exhibit", heading: "Rules of Conduct" })
  })

  it("gives every provision the schema's shape", () => {
    for (const provision of documents.flatMap((document) => document.provisions)) {
      expect(provisionSchema.safeParse(provision).success).toBe(true)
    }
  })

  it("reads numbers through lost periods and roman numerals read as digits", () => {
    expect(find("declaration:1.1")).toMatchObject({
      kind: "section",
      heading: "Purpose",
      num: { printed: "11", normalized: "1.1", source: "printed" }
    })
    expect(find("declaration:3.1(a)(iii)")).toMatchObject({ num: { printed: "(111)", normalized: "iii" } })
  })

  it("separates headings, intros and text", () => {
    expect(find("declaration:3.1(a)")).toMatchObject({
      heading: "Household Pets",
      intro: "The owner of a Lot may keep household pets, subject to:",
      text: ""
    })
    expect(find("declaration:3.1(b)")).toMatchObject({
      heading: "Livestock",
      text: "No livestock may be kept on any Lot."
    })
    expect(find("declaration:part-one")).toMatchObject({ kind: "paragraph", heading: "Foundations" })
  })

  it("counts unnumbered paragraphs, and gives a paragraph after a list of clauses to the list's parent", () => {
    expect(find("declaration:1.1/p2")).toMatchObject({
      kind: "paragraph",
      num: { printed: null, normalized: "2", source: "counted" },
      text: "The plan binds every owner."
    })
    expect(find("declaration:3.1(a)/p2")?.parentLabel).toBe("3.1(a)")
  })

  it("keeps a section's single paragraph as its text, tables included", () => {
    expect(find("declaration:1.2")?.text).toBe("The governing documents are: Declaration sets the covenants")
  })

  it("reads definitions with their aliases and joins a paragraph across a page break", () => {
    expect(find("declaration:article-2/board-of-trustees")).toMatchObject({
      kind: "definition",
      heading: "Board of Trustees, Board"
    })
    expect(find("declaration:article-2/common-grounds")?.text).toMatch(/guests, as described in Section 1\.2\.$/)
    expect(find("declaration:article-2/common-grounds")?.anchors.map((anchor) => anchor.page)).toEqual([4, 5])
  })

  it("finds a section whose heading Layout tagged as the page header", () => {
    expect(find("declaration:3.2")).toMatchObject({
      heading: "Vehicles",
      text: "Boats and trailers must be stored in a garage."
    })
  })

  it("anchors provisions in the page text", () => {
    const page = syntheticPages().find((item) => item.pageIndex === 5)
    const anchor = find("declaration:3.1(b)")?.anchors[0]
    expect(page?.text.slice(anchor?.start, anchor?.end)).toBe("(b) Livestock. No livestock may be kept on any Lot.")
  })
})

describe("splitHeading", () => {
  it.each([
    [
      "Leasing. For purposes of this Section, leasing means",
      false,
      "Leasing",
      "For purposes of this Section, leasing means"
    ],
    [
      "Restrictions on Occupancy The Units are for residents",
      false,
      "Restrictions on Occupancy",
      "The Units are for residents"
    ],
    ["Monitoring; Records of Age The Board keeps them.", false, "Monitoring; Records of Age", "The Board keeps them."],
    ["The Board may act.", false, null, "The Board may act."],
    ["December 31, 2030; or", false, null, "December 31, 2030; or"],
    ["Alternatively, Members may vote", false, null, "Alternatively, Members may vote"],
    ["Working Capital Fund", true, "Working Capital Fund", ""],
    ["Working Capital Fund", false, null, "Working Capital Fund"]
  ])("%s", (rest, isSection, heading, text) => {
    expect(splitHeading(rest, isSection)).toEqual({ heading, text })
  })
})

describe("definitions", () => {
  it("reads every name a definition gives, with a quoted letter inside one", () => {
    expect(definedNames('"Record," "Recording," or "Recorded": To file')).toEqual(["Record", "Recording", "Recorded"])
    expect(definedNames('"Class "B" Period": The time')).toEqual(['Class "B" Period'])
    expect(definedNames("The term means")).toEqual([])
  })

  it("keys a definition by its first name unless a later one is a distinct short name", () => {
    expect(definitionSlug(["Board of Trustees", "Board"])).toBe("board-of-trustees")
    expect(definitionSlug(["Record", "Recording", "Recorded"])).toBe("record")
    expect(definitionSlug(["Maple Hollow Services", "MHS"])).toBe("mhs")
    expect(definitionSlug(["Private Amenity(ies)"])).toBe("private-amenity")
    expect(definitionSlug([])).toBeNull()
  })
})

describe("documents that don't divide into articles", () => {
  const labelsOf = (pages: string[]) =>
    structureDocument(cleanPages(pagesOf(pages.map((text) => ({ text })))), { documentKey: "covenants", fileId: "f" })
      .flatMap((document) => document.provisions)
      .map((provision) => provision.label)

  it("reads numbered sections as the top divisions when there are no articles", () => {
    expect(
      labelsOf([
        [
          "# COVENANTS FOR CEDAR BEND",
          "",
          "These covenants are made by the Cedar Bend Owners Club.",
          "",
          "## RECITALS",
          "",
          "The Club owns the land described below.",
          "",
          "## DEFINITIONS",
          "",
          '"Lot" shall mean any numbered parcel shown on the plat.',
          "",
          '"Club" shall mean the Cedar Bend Owners Club.',
          "",
          "## SECTION 1 - LAND USE",
          "",
          "1.1 USE. Lots shall be used for homes only.",
          "",
          "1.2 SIGNS. No sign shall exceed two square feet.",
          "",
          "1.2.1 One sale sign is allowed.",
          "",
          "## SECTION 2 - FENCES",
          "",
          "2.1 HEIGHT. No fence shall exceed six feet."
        ].join("\n")
      ])
    ).toEqual([
      "preamble",
      "recitals",
      "definitions",
      "definitions/lot",
      "definitions/club",
      "section-1",
      "1.1",
      "1.2",
      "1.2.1",
      "section-2",
      "2.1"
    ])
  })

  it("reads numbered covenants with no division above them, Layout's escaped markers included", () => {
    expect(
      labelsOf([
        [
          "# RESTRICTIVE COVENANTS",
          "",
          "The owner declares the following covenants.",
          "",
          "1\\. Lots shall be used for homes only.",
          "",
          "2\\. No building shall exceed two stories.",
          "",
          "No tree shall be removed without approval.",
          "",
          "3\\. These covenants run for thirty years."
        ].join("\n")
      ])
    ).toEqual(["preamble", "1", "2", "2/p2", "3"])
  })
})
