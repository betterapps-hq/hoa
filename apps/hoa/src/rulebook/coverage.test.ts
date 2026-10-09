import { describe, expect, it } from "vitest"
import type { Page } from "@/ocr/page"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookRecords } from "./assemble"
import {
  coverageKindOf,
  coverageOf,
  coverageReport,
  coveredShare,
  encodedValuesOf,
  referencesTo,
  textOutsideProvisions,
  totalOf,
  valueMarks,
  type EncodedValue,
  type ProvisionCoverage
} from "./coverage"

const approved: T.Review = { status: "approved", by: "admin", at: "2026-10-09T00:00:00Z", note: null }
const ageRule = "declaration:3.1(a)#age-55-occupant"

function sampleRecords(): RulebookRecords {
  const file = sampleRulesFile()
  return { ...file, terms: [...file.terms, ...file.proposedCore] }
}

const vocabulary = createVocabulary(sampleRecords().terms)

function provision(label: string, fields: Partial<T.Provision> = {}): T.Provision {
  return {
    key: `rules:${label}`,
    kind: "section",
    num: null,
    label,
    heading: null,
    parentLabel: null,
    intro: null,
    text: `Text of ${label}.`,
    wrapUp: null,
    anchors: [],
    noRule: null,
    ...fields
  }
}

function page(pageIndex: number, text: string, header: string | null = null): Page {
  return {
    documentId: "upload",
    pageIndex,
    pageLabel: null,
    labelSource: null,
    engine: "test",
    optionsHash: "test",
    text,
    normalizedText: text,
    header,
    footer: null,
    headings: [],
    sectionAtTop: null,
    checkboxes: [],
    figures: [],
    minConfidence: null,
    lowConfidenceSpans: []
  }
}

const nothing: ProvisionCoverage = { rules: [], terms: [], clauses: [], questions: [] }

describe("coverageOf", () => {
  it("lists what cites each provision, and uncovers one whose only rule is rejected", () => {
    const records = sampleRecords()
    const cited = "declaration:3.1(a)"
    expect(coverageOf(records).byProvision.get(cited)?.rules).toContain(ageRule)
    expect(coverageOf(records).uncovered).toEqual([])

    const onlyRule = {
      ...records,
      rules: records.rules
        .filter((item) => item.key === ageRule || !item.citations.some((citation) => citation.provisionKey === cited))
        .map((item) =>
          item.key === ageRule ? { ...item, review: { ...approved, status: "rejected" as const } } : item
        ),
      terms: records.terms.filter((term) => !JSON.stringify(term).includes(`"${cited}"`)),
      questions: []
    }
    expect(coverageOf(onlyRule).uncovered).toEqual([cited])
  })

  it("names the settings clauses citing a provision", () => {
    const records = sampleRecords()
    const [liability] = records.settings.clauses.liability
    const cited = liability?.citations[0]?.provisionKey ?? ""
    expect(coverageOf(records).byProvision.get(cited)?.clauses).toContain("liability")
  })
})

describe("coverageKindOf", () => {
  it("takes the strongest record citing a provision, then its reason, then uncovered", () => {
    const reason = (status: T.Review["status"]): T.NoRule => ({
      reason: "heading",
      note: null,
      review: { ...approved, status }
    })
    expect(coverageKindOf(provision("1"), { ...nothing, rules: ["r"], terms: ["t"] })).toBe("rule")
    expect(coverageKindOf(provision("1"), { ...nothing, questions: ["q"] })).toBe("rule")
    expect(coverageKindOf(provision("1"), { ...nothing, terms: ["t"], clauses: ["time"] })).toBe("term")
    expect(coverageKindOf(provision("1"), { ...nothing, clauses: ["time"] })).toBe("settings")
    expect(coverageKindOf(provision("1", { noRule: reason("approved") }), nothing)).toBe("reason")
    expect(coverageKindOf(provision("1", { noRule: reason("proposed") }), nothing)).toBe("to-review")
    expect(coverageKindOf(provision("1"), undefined)).toBe("uncovered")
  })
})

describe("textOutsideProvisions", () => {
  it("gives the cleaned page text outside every anchor, without page furniture", () => {
    const first =
      "Recorded 2001\n\n1.1 Fences are allowed.\n\nAn unnumbered note.\nIt goes on.\n\n1.2 Sheds need approval."
    const second = "A last word."
    const pages = [page(1, first, "Recorded 2001"), page(2, second)]
    const fenceStart = first.indexOf("1.1")
    const shedStart = first.indexOf("1.2")
    const provisions = [
      {
        anchors: [{ fileId: "upload", page: 1, start: fenceStart, end: fenceStart + "1.1 Fences are allowed.".length }]
      },
      { anchors: [{ fileId: "upload", page: 1, start: shedStart, end: first.length }] },
      { anchors: [{ fileId: "other", page: 2, start: 0, end: second.length }] }
    ]
    const result = textOutsideProvisions("upload", pages, provisions)
    expect(result.outside.map((passage) => [passage.page, passage.text])).toEqual([
      [1, "An unnumbered note. It goes on."],
      [2, "A last word."]
    ])
    expect(result.outside[0]?.start).toBe(first.indexOf("An unnumbered"))
    expect(result.skippedPages).toEqual([])
  })
})

describe("encodedValuesOf and valueMarks", () => {
  it("finds the amounts a rule encodes in its provision's text", () => {
    const rule = sampleRecords().rules.find((item) => item.key === ageRule)
    const values = rule ? encodedValuesOf(rule) : []
    expect(values).toContainEqual({ type: "amount", value: 55, unit: "year" })
    const text = "at least one person 55 years of age or older"
    const marks = valueMarks(text, values, vocabulary)
    expect(marks.map((mark) => text.slice(mark.start, mark.end))).toEqual(["55 years"])
  })

  it("reads numbers in words and numerals, money, fractions, dates and times", () => {
    const values: EncodedValue[] = [
      { type: "amount", value: 30, unit: "calendar-day" },
      { type: "amount", value: 50, unit: "usd" },
      { type: "amount", value: 6, unit: "foot" },
      { type: "number", value: 1 },
      { type: "number", value: 2 },
      { type: "fraction", numerator: 2, denominator: 3 },
      { type: "date", value: "2025-11-12" },
      { type: "time", value: "22:00" },
      { type: "month-day", value: "11-15" }
    ]
    const text =
      "Within thirty (30) days, pay $50.00 for a fence over six (6) feet; one owner, two pets; two-thirds of the votes; " +
      "adopted November 12, 2025; quiet after 10:00 p.m. from November 15; Section 6 applies."
    const marked = valueMarks(text, values, vocabulary).map((mark) => text.slice(mark.start, mark.end))
    expect(marked).toEqual([
      "thirty (30) days",
      "$50.00",
      "six (6) feet",
      "two",
      "two-thirds",
      "November 12, 2025",
      "10:00 p.m.",
      "November 15"
    ])
  })

  it("marks nothing for a value the text doesn't state with its unit", () => {
    const values: EncodedValue[] = [{ type: "amount", value: 6, unit: "foot" }]
    expect(valueMarks("Section 6 applies.", values, vocabulary)).toEqual([])
  })
})

describe("coverageReport", () => {
  it("counts the sample's characters by kind, per document and article", () => {
    const records = sampleRecords()
    const report = coverageReport(records, coverageOf(records), vocabulary)
    expect(report.documents.map((document) => document.key)).toEqual(["declaration", "use-restrictions"])
    const declaration = report.documents[0]
    expect(declaration?.articles[0]?.provision.key).toBe("declaration:preamble")
    const characters = records.provisions.reduce(
      (sum, item) => sum + [item.heading, item.text, item.intro, item.wrapUp].filter(Boolean).join("\n").length,
      0
    )
    // Each provision's heading, text and intro join with a newline; a wrap-up is a passage of its own.
    const wrapUps = records.provisions.filter((item) => item.wrapUp).length
    expect(totalOf(report.totals)).toBe(characters - wrapUps)
    expect(report.totals.uncovered).toBe(0)
    expect(report.totals.outside).toBe(0)
    expect(coveredShare(report.totals)).toBeGreaterThan(0)
    const article = declaration?.articles.find((item) => item.provision.key === "declaration:article-3")
    expect(article?.passages.some((passage) => passage.key === "declaration:3.1(a)")).toBe(true)
  })

  it("reads parents before children, wrap-ups after them, and outside text where its page puts it", () => {
    const anchor = (page: number, start: number) => [{ fileId: "upload", page, start, end: start + 10 }]
    // Stored child first: the report still reads the parent first.
    const provisions = [
      provision("1(a)", { parentLabel: "1", anchors: anchor(1, 20) }),
      provision("1", { heading: "Fences", intro: "The following:", wrapUp: "All of them.", anchors: anchor(1, 0) }),
      provision("2", { anchors: anchor(2, 0), noRule: { reason: "heading", note: null, review: approved } })
    ]
    const records = {
      documents: [
        { key: "rules", kind: "rules" as const, title: "Rules", issuedBy: null, governs: null, edition: null }
      ],
      provisions,
      rules: []
    }
    const outside = [
      { fileId: "upload", page: 1, start: 12, end: 18, text: "Stray" },
      { fileId: "upload", page: 2, start: 40, end: 50, text: "Tail" }
    ]
    const coverage = coverageOf({ ...records, terms: [], settings: sampleRecords().settings, questions: [] })
    const report = coverageReport(records, coverage, vocabulary, [{ fileId: "upload", skippedPages: [1], outside }])
    const [document] = report.documents
    expect(
      document?.articles.map((article) => article.passages.map((passage) => [passage.key, passage.depth]))
    ).toEqual([
      [
        ["rules:1", 0],
        ["outside:upload:1:12", 1],
        ["rules:1(a)", 1],
        ["rules:1/wrap-up", 0]
      ],
      [
        ["rules:2", 0],
        ["outside:upload:2:40", 1]
      ]
    ])
    expect(document?.articles[0]?.passages[0]?.text).toBe("Fences\nText of 1.\nThe following:")
    expect(document?.totals.outside).toBe("StrayTail".length)
    expect(document?.totals.reason).toBe("Text of 2.".length)
    expect(document?.skippedPages).toEqual([{ fileId: "upload", pages: [1] }])
  })
})

describe("referencesTo", () => {
  it("lists the provisions whose text cites each provision", () => {
    const provisions = [
      provision("1.1", { text: "Fences need approval." }),
      provision("1.2", { text: "Despite Section 1.1, and subject to Section 1.3, gates don't." }),
      provision("1.3", { text: "As Section 1.1 says, so does this." })
    ]
    const referencedBy = referencesTo(provisions)
    expect(referencedBy.get("rules:1.1")).toEqual(["rules:1.2", "rules:1.3"])
    expect(referencedBy.get("rules:1.3")).toEqual(["rules:1.2"])
    expect(referencedBy.get("rules:1.2")).toBeUndefined()
  })
})
