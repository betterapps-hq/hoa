import { describe, expect, it } from "vitest"
import { newJob } from "@/db/jobRepository"
import { normalizeForMatching, type Page } from "@/ocr/page"
import { catalogForPrompt, routingOptions, truncate } from "@/pipeline/catalogPrompt"
import type { Rule } from "@/rules/rule"
import { fenceRules } from "@/tests/fenceRulebook"
import {
  addCitation,
  applyRuleChanges,
  approvalBlocker,
  citationFromSelection,
  describeBuildProblem,
  describeCheck,
  describeConditions,
  issueSeverity,
  needsAttention,
  plainQuote,
  publishBlockers,
  readyToApprove,
  removeCitation,
  replaceCitation,
  sectionAt
} from "./rulebookEditing"

const byId = (id: string) => fenceRules.find((rule) => rule.id === id)!

const page = (text: string): Page => ({
  documentId: "guidelines",
  pageIndex: 17,
  pageLabel: "17",
  labelSource: "page-number",
  engine: "e",
  optionsHash: "h",
  text,
  normalizedText: text.toLowerCase(),
  header: null,
  footer: null,
  headings: [],
  sectionAtTop: null,
  checkboxes: [],
  figures: [],
  minConfidence: null,
  lowConfidenceSpans: []
})

describe("applyRuleChanges", () => {
  const rule = {
    ...byId("composite-colors"),
    issues: [
      { code: "conflict" as const, message: "Differs from the CC&Rs.", resolution: null },
      { code: "low-confidence" as const, message: "Scan", resolution: null },
      { code: "sanity" as const, message: "Old", resolution: null }
    ]
  }

  it("edits the fields, keeps build and citation issues, leaves citations alone and puts the rule back to pending", () => {
    const edited = applyRuleChanges(rule, { title: "Colors" })
    expect(edited).toMatchObject({
      title: "Colors",
      ruleKey: rule.ruleKey,
      citations: rule.citations,
      review: { status: "pending", isEdited: true }
    })
    expect(edited.issues.map((issue) => issue.code)).toEqual(["conflict", "low-confidence"])
  })
})

describe("citations picked from a document", () => {
  const text =
    "### 5.4.1 Wood Fence Colors.\n\n(iii)\nFence colors are limited to the following:\n\na)\n**Behr**: Cedar (SC-146)\n"
  const sourcePage: Page = {
    ...page(text),
    normalizedText: normalizeForMatching(text),
    headings: [{ level: 4, text: "5.4.1 Wood Fence Colors", offset: 0 }]
  }
  const listStart = text.indexOf("Fence colors")

  it("quotes exactly the selected text as plain text, with its section, page and range", () => {
    const citation = citationFromSelection(sourcePage, { start: listStart - 1, end: text.length }, "Guidelines")
    expect(citation).toMatchObject({
      documentId: "guidelines",
      section: "5.4.1 Wood Fence Colors",
      pageIndex: 17,
      pageLabel: "17",
      quote: "Fence colors are limited to the following: a) Behr: Cedar (SC-146)",
      match: { status: "exact" },
      range: { start: listStart, end: text.length - 1 }
    })
    expect(() => citationFromSelection(sourcePage, { start: 5, end: 5 }, "Guidelines")).toThrow("Select the passage")
    expect(() => citationFromSelection(sourcePage, { start: 0, end: 9999 }, "Guidelines")).toThrow("Select the passage")
  })

  it("names the section from the nearest heading above, else the page's section, else the document", () => {
    expect(sectionAt(sourcePage, 40, "Guidelines")).toBe("5.4.1 Wood Fence Colors")
    expect(sectionAt({ ...sourcePage, headings: [], sectionAtTop: "5.4 Fence Colors" }, 40, "Guidelines")).toBe(
      "5.4 Fence Colors"
    )
    expect(sectionAt({ ...sourcePage, headings: [] }, 40, "Guidelines")).toBe("Guidelines")
  })

  it("strips Markdown marks from a quote", () => {
    expect(plainQuote("## Title <!-- PageBreak -->\n| a | **b** |\n`c`")).toBe("Title a b c")
  })

  it("adds a citation, refuses a duplicate, and removes any, including the last", () => {
    const rule = { ...byId("composite-colors"), issues: [] }
    const citation = citationFromSelection(sourcePage, { start: listStart, end: text.length }, "Guidelines")
    const cited = addCitation(rule, citation)
    expect(cited.citations).toHaveLength(rule.citations.length + 1)
    expect(cited.review).toMatchObject({ status: "pending", isEdited: true })
    expect(() => addCitation(cited, citation)).toThrow("already cites")

    const wider = { ...citation, quote: "Fence colors are limited to the following: a) Behr" }
    const replaced = replaceCitation(cited, cited.citations.length - 1, wider)
    expect(replaced.citations.at(-1)).toEqual(wider)
    expect(replaced.citations).toHaveLength(cited.citations.length)
    expect(() => replaceCitation(cited, 0, citation)).toThrow("already cites")
    expect(() => replaceCitation(cited, 9, citation)).toThrow("doesn't exist")

    const removed = removeCitation(cited, 0)
    expect(removed.citations).toEqual([citation])
    const uncited = removeCitation(removed, 0)
    expect(uncited.citations).toEqual([])
    expect(approvalBlocker(uncited)).toBe("Add the passage this rule comes from before approving.")
    expect(publishBlockers([{ ...uncited, review: { ...uncited.review, status: "approved" } }])).toEqual([
      "1 rule has no citation."
    ])
    expect(publishBlockers([uncited, uncited])).toContain("2 rules have no citation.")
    expect(() => removeCitation(cited, 9)).toThrow("doesn't exist")
  })

  it("blocks approval while a citation's quote isn't on its page", () => {
    const missing = {
      ...byId("composite-colors"),
      citations: [{ ...citationFromSelection(sourcePage, { start: listStart, end: text.length }, "G"), quote: "Vinyl" }]
    }
    const rechecked = removeCitation(
      addCitation(missing, {
        ...citationFromSelection(sourcePage, { start: listStart, end: text.length }, "G"),
        match: { status: "not-found", score: 0, touchesLowConfidence: false }
      }),
      0
    )
    expect(approvalBlocker(rechecked)).toBe("Replace the citation whose quote isn't on its page before approving.")
    expect(approvalBlocker(byId("posts"))).toBeNull()
  })
})
describe("readyToApprove", () => {
  it("picks pending rules whose issues are all resolved", () => {
    const pending = { ...byId("posts"), review: { ...byId("posts").review, status: "pending" as const } }
    const open = { ...pending, id: "open", issues: [{ code: "sanity" as const, message: "x", resolution: null }] }
    const resolved = {
      ...pending,
      id: "resolved",
      issues: [{ code: "conflict" as const, message: "x", resolution: { note: "ok", resolvedBy: "a", resolvedAt: "" } }]
    }
    expect(readyToApprove([pending, open, resolved, byId("materials")]).map((rule) => rule.id)).toEqual([
      "posts",
      "resolved"
    ])
  })
})

describe("publishBlockers", () => {
  it("lists pending rules and unresolved conflicts on rules that aren't rejected", () => {
    const pending = { ...byId("posts"), review: { ...byId("posts").review, status: "pending" as const } }
    const conflict = { ...byId("materials"), issues: [{ code: "conflict" as const, message: "x", resolution: null }] }
    const rejectedConflict = { ...conflict, id: "other", review: { ...conflict.review, status: "rejected" as const } }
    expect(publishBlockers([pending, conflict, rejectedConflict])).toEqual([
      "1 rule is still pending.",
      "1 rule has an unresolved conflict."
    ])
    expect(publishBlockers([pending, pending])).toEqual(["2 rules are still pending."])
    expect(publishBlockers([byId("posts")])).toEqual([])
  })
})

describe("describeCheck and describeConditions", () => {
  it("summarize every check type in plain language", () => {
    expect(describeCheck(byId("manufacturers").check)).toBe(
      "segment.manufacturer is one of Trex, Frame It All, Neoline; others go to the committee"
    )
    expect(describeCheck(byId("composite-colors").check)).toContain("Trex to Winchester Grey, Saddle")
    expect(describeCheck(byId("no-vinyl").check)).toBe("segment.material isn't vinyl")
    expect(describeCheck(byId("metal-height").check)).toBe("segment.height between 48 and 72")
    expect(describeCheck(byId("min-height").check)).toBe("segment.height at least 40")
    expect(describeCheck(byId("max-height").check)).toBe("segment.height at most 72")
    expect(describeCheck(byId("posts").check)).toBe("segment.postColor matches segment.color")
    expect(describeCheck({ type: "required-fact", attribute: "segment.height" })).toBe("segment.height is given")
    expect(describeCheck(byId("neighbor-approval").check)).toBe(
      "Includes the neighbor approval, stating approves the placement and height of the fence and the materials"
    )
    expect(describeCheck(byId("sight-lines").check)).toBe(
      "Doesn't interfere with a driver's ability to see objects in the roadway"
    )
    expect(describeCheck(byId("like-for-like").check)).toBe("For information; not checked")
  })

  it("summarize conditions", () => {
    expect(describeConditions([])).toBeNull()
    expect(describeConditions(byId("max-height").appliesWhen)).toBe(
      "segment.material is wood or composite, and segment.location is side or rear or return"
    )
    expect(
      describeConditions([
        { type: "fact", attribute: "segment.style", operator: "exists", value: null },
        { type: "fact", attribute: "segment.material", operator: "not-in", value: ["vinyl"] },
        { type: "text", id: "c", description: "Visible from the street" }
      ])
    ).toBe("segment.style is given, and segment.material isn't vinyl, and Visible from the street")
  })
})

describe("catalog prompt helpers", () => {
  it("describes the catalog and routing options, and truncates long text at a line break", () => {
    expect(JSON.parse(catalogForPrompt("fence"))).toMatchObject({
      projectType: "fence",
      components: ["segment", "gate"]
    })
    expect(routingOptions().projectTypes).toBe("fence: Fence, with segment and gate components")
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("line one\nline two\nline three", 15)).toBe("line one\n[truncated]")
    expect(truncate("x".repeat(20), 5)).toBe("xxxxx\n[truncated]")
  })
})

describe("describeBuildProblem", () => {
  const job = newJob({ hoaId: "hoa", kind: "rulebook-build", subjectId: "r", now: "" })
  const failure = { stage: "extract", itemId: "s", message: "Bad schema" }

  it("explains a failed build or skipped items, and nothing for a clean one", () => {
    expect(describeBuildProblem(null)).toBeNull()
    expect(describeBuildProblem({ ...job, status: "completed" })).toBeNull()
    expect(describeBuildProblem({ ...job, status: "failed" })).toBe("The build failed.")
    expect(
      describeBuildProblem({
        ...job,
        status: "failed",
        error: { stage: "load", message: "No documents", isRetryable: false }
      })
    ).toBe("No documents")
    expect(describeBuildProblem({ ...job, status: "completed-with-errors", failures: [failure] })).toBe(
      "1 item failed (extract): Bad schema"
    )
    expect(describeBuildProblem({ ...job, status: "completed-with-errors", failures: [failure, failure] })).toBe(
      "2 items failed (extract): Bad schema"
    )
  })
})

describe("issueSeverity and needsAttention", () => {
  const issue = (code: Rule["issues"][number]["code"], resolved = false): Rule["issues"][number] => ({
    code,
    message: code,
    resolution: resolved ? { note: "ok", resolvedBy: "a", resolvedAt: "" } : null
  })

  it("ranks issues and flags rules that still need a look", () => {
    expect(issueSeverity(issue("conflict"))).toBe("blocking")
    expect(issueSeverity(issue("citation-not-found"))).toBe("blocking")
    expect(issueSeverity(issue("duplicate-key"))).toBe("warning")
    expect(issueSeverity(issue("low-confidence"))).toBe("note")

    const approved = byId("posts")
    expect(needsAttention(approved)).toBe(false)
    expect(needsAttention({ ...approved, review: { ...approved.review, status: "pending" } })).toBe(true)
    expect(needsAttention({ ...approved, issues: [issue("duplicate-key")] })).toBe(true)
    expect(needsAttention({ ...approved, issues: [issue("low-confidence"), issue("conflict", true)] })).toBe(false)
    expect(
      needsAttention({ ...approved, issues: [issue("sanity")], review: { ...approved.review, status: "rejected" } })
    ).toBe(false)
    expect(describeCheck({ type: "range", attributes: ["segment.length"], min: null, max: null })).toBe(
      "segment.length: no limit given"
    )
  })
})
