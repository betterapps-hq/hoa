import { describe, expect, it } from "vitest"
import {
  decidePoint,
  intToRoman,
  isMarkerOnly,
  parseExhibitMarker,
  parseHeadingMarker,
  parsePointMarker,
  parseSectionMarker,
  readSection,
  renderPoint,
  romanToInt,
  type OpenList,
  type PointMarker
} from "./numbering"

const point = (text: string): PointMarker => {
  const marker = parsePointMarker(text)
  if (!marker) {
    throw new Error(`no marker in ${text}`)
  }
  return marker
}

describe("roman numerals", () => {
  it.each([
    ["i", 1],
    ["iv", 4],
    ["ix", 9],
    ["xii", 12],
    ["xl", 40]
  ])("%s is %i", (roman, value) => {
    expect(romanToInt(roman)).toBe(value)
    expect(intToRoman(value)).toBe(roman)
  })

  it("rejects malformed numerals", () => {
    expect(romanToInt("iiii")).toBeNull()
    expect(romanToInt("ab")).toBeNull()
  })
})

describe("parsePointMarker", () => {
  it.each([
    ["(a) text", [{ style: "lower", ordinal: 1 }]],
    ["e) text", [{ style: "lower", ordinal: 5 }]],
    ["(3) text", [{ style: "number", ordinal: 3 }]],
    ["(B) text", [{ style: "upper", ordinal: 2 }]],
    ["(iv) text", [{ style: "roman", ordinal: 4 }]],
    ["(1v) text", [{ style: "roman", ordinal: 4 }]],
    ["(IV) text", [{ style: "roman", ordinal: 4 }]],
    [
      "(111) text",
      [
        { style: "number", ordinal: 111 },
        { style: "roman", ordinal: 3 }
      ]
    ],
    [
      "(1) text",
      [
        { style: "number", ordinal: 1 },
        { style: "roman", ordinal: 1 },
        { style: "lower", ordinal: 9 }
      ]
    ],
    [
      "(i) text",
      [
        { style: "roman", ordinal: 1 },
        { style: "lower", ordinal: 9 }
      ]
    ],
    [
      "(V) text",
      [
        { style: "roman", ordinal: 5 },
        { style: "upper", ordinal: 22 }
      ]
    ]
  ])("%s", (text, readings) => {
    expect(point(text)).toEqual({ printed: `(${text.split(")")[0]?.replace("(", "")})`, readings, rest: "text" })
  })

  it("doesn't read parentheses that hold words", () => {
    expect(parsePointMarker("(collectively, the Rules)")).toBeNull()
    expect(parsePointMarker("(e.g., a corporation)")).toBeNull()
    expect(parsePointMarker("Section 4")).toBeNull()
  })

  it("renders each style's normalized number", () => {
    expect(renderPoint({ style: "lower", ordinal: 3 })).toBe("c")
    expect(renderPoint({ style: "upper", ordinal: 3 })).toBe("C")
    expect(renderPoint({ style: "roman", ordinal: 3 })).toBe("iii")
    expect(renderPoint({ style: "number", ordinal: 3 })).toBe("3")
  })
})

describe("headings, exhibits and sections", () => {
  it.each([
    ["ARTICLE 4 ARCHITECTURE", { type: "article", printed: "4", number: 4, rest: "ARCHITECTURE" }],
    ["Article IV. Architecture", { type: "article", printed: "IV", number: 4, rest: "Architecture" }],
    ["PART ONE: INTRODUCTION", { type: "part", printed: "ONE", number: 1, rest: "INTRODUCTION" }],
    ["PART SEVEN CHANGES", { type: "part", printed: "SEVEN", number: 7, rest: "CHANGES" }]
  ])("%s", (text, marker) => {
    expect(parseHeadingMarker(text)).toEqual(marker)
  })

  it("rejects an article word that isn't a number", () => {
    expect(parseHeadingMarker("Articles of Incorporation")).toBeNull()
    expect(parseHeadingMarker("Part of the Lot")).toBeNull()
  })

  it("reads exhibit headings", () => {
    expect(parseExhibitMarker('EXHIBIT "C" Initial Rules')).toEqual({ printed: "C", rest: "Initial Rules" })
    expect(parseExhibitMarker("Exhibit a")).toEqual({ printed: "A", rest: "" })
    expect(parseExhibitMarker("Exhibits A and B")).toBeNull()
  })

  it.each([
    ["4.3 Guidelines", [4, 3], "Guidelines"],
    ["4 3 Guidelines", [4, 3], "Guidelines"],
    ["43 Guidelines", [43], "Guidelines"],
    ["20-3 Validity", [20, 3], "Validity"],
    ["Section 5.4.2 Colors", [5, 4, 2], "Colors"],
    ["8 10 Working Fund.", [8, 10], "Working Fund."]
  ])("%s", (text, parts, rest) => {
    expect(parseSectionMarker(text)).toMatchObject({ parts, rest })
  })

  it("reads a section number as the next section of the article, repairing lost periods", () => {
    const read = (text: string, article: number, expected: number, isHeading = false) => {
      const marker = parseSectionMarker(text)
      return marker ? readSection(marker, article, expected, isHeading) : null
    }
    expect(read("43", 4, 3)).toEqual({ section: 3, isInferred: false })
    expect(read("111", 11, 1)).toEqual({ section: 1, isInferred: false })
    expect(read("8 10", 8, 10)).toEqual({ section: 10, isInferred: false })
    expect(read("5.2", 15, 2)).toEqual({ section: 2, isInferred: true })
    expect(read("21 years", 1, 3)).toBeNull()
    expect(read("4.6", 4, 4)).toBeNull()
    expect(read("4.6", 4, 4, true)).toEqual({ section: 6, isInferred: false })
  })

  it("knows a line that is only a marker", () => {
    expect(isMarkerOnly("(a)")).toBe(true)
    expect(isMarkerOnly("42")).toBe(true)
    expect(isMarkerOnly("Section 7 2.")).toBe(false)
    expect(isMarkerOnly("(a) text")).toBe(false)
  })
})

describe("decidePoint", () => {
  const lists = (...items: [OpenList["style"], number][]) => items.map(([style, last]) => ({ style, last }))

  it.each([
    ["(h) after (g) continues the letters", "(h)", lists(["lower", 7]), null, false, "sibling", "lower", 8],
    ["(i) after (h) is a letter", "(i)", lists(["lower", 8]), null, false, "sibling", "lower", 9],
    ["(j) after (i) is a letter", "(j)", lists(["lower", 9]), null, false, "sibling", "lower", 10],
    ["(i) after (a) starts numerals", "(i)", lists(["lower", 1]), "(ii)", false, "child", "roman", 1],
    [
      "(ii) after (i) continues the numerals",
      "(ii)",
      lists(["roman", 1], ["lower", 1]),
      null,
      false,
      "sibling",
      "roman",
      2
    ],
    [
      "(b) after (iii) closes the numerals",
      "(b)",
      lists(["roman", 3], ["lower", 1]),
      null,
      false,
      "sibling",
      "lower",
      2
    ],
    ["(1) before (11) starts numerals", "(1)", lists(["lower", 1]), "(11)", false, "child", "roman", 1],
    ["(1) before (2) starts numbers", "(1)", lists(["roman", 10]), "(2)", false, "child", "number", 1],
    ["(1) for a lost (iv)", "(1)", lists(["roman", 3]), "(v)", false, "sibling", "roman", 4],
    ["(vii) for a misread (viii)", "(vii)", lists(["roman", 7]), "(1x)", false, "sibling", "roman", 8],
    ["(i) after a paragraph restarts", "(1)", lists(["roman", 9]), "(1i)", true, "restart", "roman", 1],
    ["(A) under (iv) starts capitals", "(A)", lists(["roman", 4]), "(B)", false, "child", "upper", 1]
  ] as const)("%s", (_name, text, open, next, afterParagraph, action, style, ordinal) => {
    const decision = decidePoint(point(text), open, next ? point(next) : null, afterParagraph)
    expect(decision).toMatchObject({ action, reading: { style, ordinal } })
  })

  it("marks a repaired numeral inferred", () => {
    expect(decidePoint(point("(1)"), lists(["roman", 3]), point("(v)"), false)).toMatchObject({ isInferred: true })
  })

  it("leaves a marker that breaks every sequence as text", () => {
    expect(decidePoint(point("(q)"), lists(["lower", 2]), null, false)).toBeNull()
  })
})
