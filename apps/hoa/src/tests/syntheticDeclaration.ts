import type { Page } from "@/ocr/page"

// A small made-up declaration, written for the structure tests: it copies the numbering and layout patterns scans of
// real governing documents show (a cover and contents to skip, a recording stamp on every page, watermark scraps,
// periods lost from section numbers, roman numerals read as digits, a heading Layout tagged as the page header, a
// table, hyphenated and page-spanning lines, a definitions article, an exhibit that is a document of its own) and
// none of their text.

const stamp = (page: number) => `Recorded instrument 2024-${String(page).padStart(3, "0")} page ${page}`

const texts: { text: string; header?: string }[] = [
  { text: "When recorded return to:\nSample Law Office\n\n# DECLARATION OF COVENANTS FOR MAPLE HOLLOW" },
  {
    text: [
      "# TABLE OF CONTENTS",
      "",
      "ARTICLE 1 GENERAL PROVISIONS",
      "1",
      "",
      "1.1 Purpose",
      "1",
      "",
      "1.2 Documents",
      "1",
      "",
      "ARTICLE 2 DEFINITIONS",
      "2",
      "",
      "ARTICLE 3 USE",
      "3",
      "",
      "3.1 Animals",
      "3",
      "",
      "3.2 Vehicles",
      "4"
    ].join("\n")
  },
  {
    text: [
      "Unoff",
      "# DECLARATION OF COVENANTS FOR MAPLE HOLLOW",
      "",
      'THIS DECLARATION is made by Maple Hollow Builders ("Declarant").',
      "",
      "# PART ONE: FOUNDATIONS",
      "",
      "This Part explains how the community is organized.",
      "",
      "## Article 1 General Provisions",
      "",
      "### 11 Purpose.",
      "",
      "This Declaration creates a plan of develop-",
      "ment for the community.",
      "",
      "The plan binds every owner.",
      "",
      "### 1.2 Documents",
      "",
      "The governing documents are:",
      "",
      "<table>",
      "<tr>",
      "<td>Declaration</td>",
      "<td>sets the covenants</td>",
      "</tr>",
      "</table>",
      "",
      stamp(3)
    ].join("\n")
  },
  {
    text: [
      "## Article 2 Definitions",
      "",
      "Capitalized terms have the meanings below.",
      "",
      '"Lot": A parcel shown on the plat.',
      "",
      '"Board of Trustees" or "Board": The governing body of the Association.',
      "",
      '"Design Code" or "Code": The standards the Board adopts.',
      "",
      '"Builder Period" or "BP": The period during which:',
      "",
      "(a) the Declarant owns a Lot;",
      "",
      "(b) a builder holds a permit.",
      "",
      '"Common Grounds": Land the Association owns for the shared use of owners and their guests, as',
      stamp(4)
    ].join("\n")
  },
  {
    text: [
      "described in Section 1.2.",
      "",
      "## Article 3 Use",
      "",
      "### 3.1 Animals",
      "",
      "(a)",
      "Household Pets The owner of a Lot may keep household pets, subject to:",
      "",
      "(1) a limit of three animals;",
      "",
      "(11) leash rules in Common Grounds; and",
      "",
      "(111) waste removal.",
      "",
      "Pets that disturb neighbors may be removed by the Board.",
      "",
      "(b) Livestock. No livestock may be kept on any Lot.",
      "",
      stamp(5)
    ].join("\n")
  },
  {
    header: "32 Vehicles",
    text: [
      "Boats and trailers must be stored in a garage.",
      "",
      "IN WITNESS WHEREOF, the Declarant signs this Declaration.",
      "",
      stamp(6)
    ].join("\n")
  },
  {
    text: [
      '# EXHIBIT "A"',
      "",
      "Rules of Conduct",
      "",
      "These rules apply to every Lot.",
      "",
      "(a) Noise. Quiet hours run from ten at night.",
      "",
      "(b) Trash. Bins stay out of sight.",
      "",
      stamp(7)
    ].join("\n")
  }
]

export function syntheticPages(): Page[] {
  return texts.map(({ text, header }, index) => ({
    documentId: "synthetic",
    pageIndex: index + 1,
    pageLabel: null,
    labelSource: null,
    engine: "test",
    optionsHash: "test",
    text,
    normalizedText: text.toLowerCase(),
    header: header ?? null,
    footer: null,
    headings: [],
    sectionAtTop: null,
    checkboxes: [],
    figures: [],
    minConfidence: null,
    lowConfidenceSpans: []
  }))
}
