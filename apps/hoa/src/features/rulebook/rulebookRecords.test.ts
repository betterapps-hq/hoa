import { describe, expect, it } from "vitest"
import type { RulebookContent } from "@/db/rulebookContentRepository"
import { createVocabulary } from "@/schema/vocabulary"
import { approvedReview, ruleIn, sampleRecords } from "@/tests/rulebookWorkspace"
import {
  amountText,
  citationIndex,
  citationLabel,
  citedProvision,
  countOf,
  readableLabel,
  recordsOf,
  referencedRule,
  relatedRules
} from "./rulebookRecords"

const records = sampleRecords()

describe("citation labels", () => {
  it("reads labels as people cite them", () => {
    expect(readableLabel("4.3(b)")).toBe("4.3(b)")
    expect(readableLabel("article-4")).toBe("Article 4")
    expect(readableLabel("exhibit-c")).toBe("Exhibit C")
    expect(readableLabel("part-one")).toBe("Part one")
    expect(readableLabel("1.1/p2")).toBe("1.1, paragraph 2")
    expect(citationLabel("use-restrictions:a(xii)")).toBe("Use restrictions a(xii)")
  })
})

describe("citedProvision", () => {
  it("gives the provision's text with its ancestors' intros, and its document's title", () => {
    const index = citationIndex(records)
    const child = records.provisions.find((provision) => {
      const parent = records.provisions.find((item) => item.label === provision.parentLabel && item.intro !== null)
      return parent !== undefined && provision.key.startsWith("declaration:")
    })
    if (!child) {
      throw new Error("The sample has a provision under a lead-in.")
    }
    const cited = citedProvision(index, { provisionKey: child.key, highlight: null, region: null })
    expect(cited.text).toBe(child.text)
    expect(cited.intros.length).toBeGreaterThan(0)
    expect(cited.documentTitle).toBe("Declaration of Covenants, Conditions and Restrictions")
    expect(citedProvision(index, { provisionKey: "declaration:99", highlight: null, region: null }).text).toMatch(
      /isn't in the documents/
    )
  })

  it("references a rule by its title and citations, the main one first", () => {
    const rule = ruleIn(records, "declaration:3.1(a)#age-55-occupant")
    const reference = referencedRule(citationIndex(records), rule)
    expect(reference.title).toBe(rule.title)
    expect(reference.citations.map((citation) => citation.label)).toEqual([
      "Declaration 3.1(a)",
      "Declaration 3.1(a)(iii)"
    ])
  })
})

describe("recordsOf", () => {
  it("shows only what the rules file holds for the published rulebook", () => {
    const content: RulebookContent = {
      settings: records.settings,
      coverage: { provisions: 0, uncovered: [] },
      rules: records.rules.map((rule, index) => (index === 0 ? { ...rule, review: approvedReview } : rule)),
      terms: records.terms,
      questions: []
    }
    const sources = { organization: records.organization, documents: records.documents, provisions: [], files: [] }
    expect(recordsOf(sources, content, "published").rules).toHaveLength(1)
    expect(recordsOf(sources, content, "published").terms).toHaveLength(0)
    expect(recordsOf(sources, content, "draft").rules).toHaveLength(records.rules.length)
  })
})

describe("relatedRules", () => {
  it("lists the rules a rule overrides and the ones overriding or enforcing it", () => {
    const related = relatedRules(ruleIn(records, "declaration:4.1/p1#approval-required"), records.rules)
    expect(related.overriddenBy).toContain("declaration:4.1/p2#no-approval-needed")
    expect(related.enforcedBy.length).toBeGreaterThan(0)
    expect(related.overrides).toEqual([])
  })
})

describe("wording", () => {
  it("counts and amounts read naturally", () => {
    const vocabulary = createVocabulary(records.terms)
    expect(amountText(1, "calendar-day", vocabulary)).toBe("1 day")
    expect(amountText(30, "calendar-day", vocabulary)).toBe("30 days")
    expect(countOf(1, "problem", "problems")).toBe("1 problem")
    expect(countOf(2, "problem", "problems")).toBe("2 problems")
  })
})
