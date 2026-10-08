import { describe, expect, it } from "vitest"
import { buildPages, computeDocumentLayout } from "@/ocr/buildPages"
import guidelines from "@/ocr/fixtures/guidelines-p16-17.json"
import { layoutResultSchema } from "@/ocr/layoutResult"
import type { Page } from "@/ocr/page"
import { fenceRules } from "@/tests/fenceRulebook"
import { carryForward } from "./carryForward"
import { applyConsolidation, hashCandidate, type VerifiedCandidate } from "./consolidate"
import { buildSections, repairNumber } from "./structure"
import { checkRuleAgainstCatalog, matchQuote } from "./verify"

const pages = buildPages(layoutResultSchema.parse(guidelines), {
  documentId: "guidelines-v1",
  engine: "azure-layout@2024-11-30",
  optionsHash: "hash",
  figureKey: (id) => id,
  sectionAtStart: null
})
const page17 = pages.find((page) => page.pageIndex === 17) as Page

describe("buildSections", () => {
  const sections = buildSections("guidelines-v1", pages, computeDocumentLayout(pages))
  const byNumber = (number: string) => sections.find((section) => section.number === number)

  it("splits the pages at headings, with deterministic ids and page markers", () => {
    const colors = byNumber("5.4.2")
    expect(colors).toMatchObject({ heading: "5.4.2 Composite Fence Colors", kind: "body", pageStart: 17 })
    expect(colors?.id).toMatch(/^guidelines-v1:\d+$/)
    expect(colors?.text.startsWith("<<page 17 | label 17>>\n5.4.2 Composite Fence Colors")).toBe(true)
    expect(colors?.text).toContain("TREX: Winchester Grey and Saddle")
    expect(colors?.text).not.toContain("5.4.3 Metal Fence Color")
  })

  it("nests sections by their numbers and keeps text that spans a page break", () => {
    expect(byNumber("5.4.2")?.parentId).toBe(byNumber("5.4")?.id)
    const height = byNumber("5.5.1")
    expect(height?.pageEnd).toBe(17)
    expect(byNumber("5.3.2")?.text).toContain("Others on a case-by-case basis")
  })

  it("finds references to other sections", () => {
    // 5.2.1 says "See RDG 5.5 for limitations on use of lattice on wood fences".
    expect(byNumber("5.2.1")?.references).toContain(byNumber("5.5")?.id)
  })

  it("repairs section numbers a scan read without periods", () => {
    expect(repairNumber("43", "4.2")).toBe("4.3")
    expect(repairNumber("43", "5.2")).toBe("43")
    expect(repairNumber("5.4", "5.3")).toBe("5.4")
    expect(repairNumber("12", null)).toBe("12")
  })

  it("adds front matter before the first heading and recognizes exhibits and definitions", () => {
    const page = (pageIndex: number, text: string, headings: Page["headings"]): Page => ({
      ...page17,
      pageIndex,
      pageLabel: null,
      text,
      headings
    })
    const document = [
      page(1, "Recorded instrument\n# Article 1 Definitions\nTerms. See Exhibit K.", [
        { level: 1, text: "Article 1 Definitions", offset: 20 }
      ]),
      page(2, "# Exhibit K\nFence drawing", [{ level: 1, text: "# Exhibit K", offset: 0 }])
    ]
    const sections = buildSections("ccrs", document, { labels: {}, repeatedLines: [] })
    expect(sections.map((section) => [section.heading, section.kind, section.number])).toEqual([
      ["Front matter", "body", null],
      ["Article 1 Definitions", "definitions", "1"],
      ["Exhibit K", "exhibit", null]
    ])
    expect(sections[1]?.references).toEqual([sections[2]?.id])
  })
})

describe("matchQuote", () => {
  it("finds an exact quote, ignoring punctuation and case", () => {
    expect(matchQuote("TREX: Winchester Grey and Saddle", page17)).toEqual({
      status: "exact",
      score: 1,
      touchesLowConfidence: false
    })
  })

  it("accepts OCR noise as a fuzzy match and rejects a quote that isn't there", () => {
    const fuzzy = matchQuote(
      "The composite fence colors shall be limited to those available through following Manufacturers",
      page17
    )
    expect(fuzzy.status).toBe("fuzzy")
    expect(fuzzy.score).toBeGreaterThanOrEqual(0.9)
    expect(matchQuote("Vinyl fences in Arctic White are approved", page17).status).toBe("not-found")
    expect(matchQuote("...", page17).status).toBe("not-found")
  })

  it("flags a quote that overlaps a low-confidence word", () => {
    const page = {
      text: "fence height 72 inches",
      normalizedText: "fence height 72 inches",
      lowConfidenceSpans: [{ start: 13, end: 15 }]
    }
    expect(matchQuote("height 72", page).touchesLowConfidence).toBe(true)
  })
})

describe("checkRuleAgainstCatalog", () => {
  const base = fenceRules.find((rule) => rule.id === "materials")!

  it("passes the sample rules", () => {
    for (const rule of fenceRules) {
      expect(checkRuleAgainstCatalog(rule)).toEqual([])
    }
  })

  it("reports unknown attributes, out-of-scope reads, invalid values and implausible ranges", () => {
    const issues = (check: (typeof base)["check"], appliesTo: (typeof base)["appliesTo"] = "segment") =>
      checkRuleAgainstCatalog({ ...base, appliesTo, check }).map((issue) => issue.code)
    expect(issues({ type: "required-fact", attribute: "segment.glitter" })).toEqual(["unknown-attribute"])
    expect(issues({ type: "required-fact", attribute: "gate.width" })).toEqual(["unknown-attribute"])
    expect(
      issues({
        type: "allowed-values",
        attribute: "segment.material",
        values: [{ value: "bamboo", aliases: [] }],
        otherwise: "not-met"
      })
    ).toEqual(["invalid-value"])
    expect(issues({ type: "range", attributes: ["segment.height"], min: 90, max: 40 })).toEqual(["sanity"])
    expect(issues({ type: "range", attributes: ["segment.height"], min: null, max: 7200 })).toEqual(["sanity"])
    expect(issues({ type: "range", attributes: ["segment.height"], min: null, max: null })).toEqual(["sanity"])
    expect(
      checkRuleAgainstCatalog({
        ...base,
        appliesWhen: [{ type: "fact", attribute: "segment.material", operator: "equals", value: "granite" }]
      }).map((issue) => issue.code)
    ).toEqual(["invalid-value"])
  })
})

function verified(
  candidateId: string,
  overrides: Partial<VerifiedCandidate["candidate"]> = {},
  documentKind: VerifiedCandidate["documentKind"] = "design-guidelines"
): VerifiedCandidate {
  return {
    candidateId,
    sectionId: "guidelines-v1:3",
    documentKind,
    candidate: {
      title: "Fence height",
      statement: "At most 72 inches",
      projectTypes: ["fence"],
      appliesTo: "segment",
      topic: "dimension",
      obligation: "required",
      discretion: "objective",
      isCurable: true,
      appliesWhen: [{ type: "text", description: "The fence is on a boundary" }],
      check: { type: "range", attributes: ["segment.height"], min: null, max: 72 },
      exceptions: [],
      citations: [{ section: "5.5.1", pageIndex: 17, quote: "72 inches" }],
      ...overrides
    },
    citations: [
      {
        documentId: "guidelines-v1",
        section: "5.5.1",
        pageIndex: 17,
        pageLabel: "17",
        quote: "72 inches",
        match: { status: "exact", score: 1, touchesLowConfidence: false }
      }
    ],
    issues: [],
    provenance: {
      source: "extraction",
      jobId: "job-1",
      sectionId: "guidelines-v1:3",
      model: "m",
      promptName: "p",
      promptVersion: 1
    }
  }
}

describe("applyConsolidation", () => {
  let counter = 0
  const createId = () => `rule-${(counter += 1)}`

  it("merges duplicates, flags conflicts by authority, links exceptions and generates ids and keys", async () => {
    counter = 0
    const rules = await applyConsolidation(
      [
        verified("a"),
        verified("b", { title: "Fence height again" }, "form"),
        verified(
          "c",
          {
            title: "Declaration height",
            check: { type: "range", attributes: ["segment.height"], min: null, max: 60 },
            appliesWhen: []
          },
          "declaration"
        ),
        verified("d", {
          title: "Arbor exception",
          check: { type: "qualitative", criterion: "Arbors may exceed" },
          appliesWhen: []
        })
      ],
      {
        duplicates: [{ keep: "a", merge: ["b"] }],
        conflicts: [{ candidateIds: ["a", "c"], description: "Different maximum heights." }],
        exceptions: [{ exceptionId: "d", modifiesId: "b" }]
      },
      { rulebookId: "rulebook-2", createId }
    )
    expect(rules).toHaveLength(3)
    const [a, c, d] = rules
    expect(a?.citations).toHaveLength(2)
    expect(a?.appliesWhen[0]).toMatchObject({ type: "text", id: `${a?.id}:c0` })
    expect(a?.issues[0]).toMatchObject({ code: "conflict", relatedRuleIds: [c?.id] })
    expect(a?.issues[0]?.message).toContain("The declaration has the highest authority.")
    expect(d?.modifies).toBe(a?.ruleKey)
    expect(a).toMatchObject({ rulebookId: "rulebook-2", change: "new", review: { status: "pending" } })
    expect(a?.extractedHash).toBe(await hashCandidate(verified("a").candidate))
  })

  it("keeps colliding rules apart with a section suffix", async () => {
    const rules = await applyConsolidation(
      [verified("a"), verified("b")],
      { duplicates: [], conflicts: [], exceptions: [] },
      { rulebookId: "r" }
    )
    expect(rules[1]?.ruleKey).toBe(`${rules[0]?.ruleKey}#5.5.1`)
    expect(rules[1]?.issues.map((issue) => issue.code)).toEqual(["duplicate-key"])
  })
})

describe("carryForward", () => {
  const context = { rulebookId: "rulebook-3", sourceDocumentIds: ["guidelines"] }
  const approved = (rule: (typeof fenceRules)[number], extractedHash: string) => ({
    ...rule,
    extractedHash,
    provenance: {
      source: "extraction" as const,
      jobId: "j",
      sectionId: "s",
      model: "m",
      promptName: "p",
      promptVersion: 1
    },
    review: { status: "approved" as const, isEdited: true, reviewedBy: "admin", reviewedAt: "2026-10-08", note: null }
  })

  it("keeps unchanged rules with their edits, marks changed ones pending, and lists removed ones", () => {
    const [height, colors, vinyl, handAdded] = [
      fenceRules.find((rule) => rule.id === "max-height")!,
      fenceRules.find((rule) => rule.id === "composite-colors")!,
      fenceRules.find((rule) => rule.id === "no-vinyl")!,
      fenceRules.find((rule) => rule.id === "posts")!
    ]
    const previous = [
      { ...approved(height, "same"), statement: "Edited by the administrator" },
      approved(colors, "old"),
      approved(vinyl, "gone"),
      { ...handAdded, citations: handAdded.citations.map((citation) => ({ ...citation, documentId: "guidelines-v0" })) }
    ]
    const extracted = [
      { ...height, id: "new-1", extractedHash: "same", review: { ...height.review, status: "pending" as const } },
      { ...colors, id: "new-2", extractedHash: "new", review: { ...colors.review, status: "pending" as const } },
      { ...fenceRules.find((rule) => rule.id === "min-height")!, id: "new-3" }
    ]

    const { rules, removed } = carryForward(extracted, previous, { ...context, published: previous })
    const [keptHeight, changedColors, newRule, carriedHandAdded] = rules
    expect(keptHeight).toMatchObject({
      id: "new-1",
      rulebookId: "rulebook-3",
      change: "unchanged",
      statement: "Edited by the administrator",
      review: { status: "approved", isEdited: true }
    })
    expect(changedColors).toMatchObject({ id: "new-2", change: "changed", review: { status: "pending" } })
    expect(newRule?.change).toBe("new")
    expect(carriedHandAdded).toMatchObject({
      rulebookId: "rulebook-3",
      change: "changed",
      review: { status: "pending" }
    })
    expect(removed).toEqual([{ ruleKey: vinyl.ruleKey, title: vinyl.title, citations: vinyl.citations }])

    // Rules only in an unpublished draft were never in force, so a new build dropping them removes nothing.
    expect(carryForward(extracted, previous, { ...context, published: [] }).removed).toEqual([])
  })
})
