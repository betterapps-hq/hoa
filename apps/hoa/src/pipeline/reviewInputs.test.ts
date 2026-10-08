import { describe, expect, it } from "vitest"
import type { Page } from "@/ocr/page"
import type { Fact, Finding } from "@/review/reviewModel"
import { fenceRules } from "@/tests/fenceRulebook"
import { decide } from "./decide"
import {
  actionItemsForPrompt,
  allowedValuesForPrompt,
  checkboxesForPrompt,
  fileKindOf,
  findingsForWriter,
  hasOpenRequests,
  informationalRulesForPrompt,
  ownersOfRecord,
  pagesForPrompt,
  phraseItems,
  requirementsForPrompt,
  textConditionsForPrompt,
  type FilePages
} from "./reviewInputs"

const page = (pageIndex: number, text: string, checkboxes: Page["checkboxes"] = []): Page => ({
  documentId: "f1",
  pageIndex,
  pageLabel: null,
  labelSource: null,
  engine: "e",
  optionsHash: "h",
  text,
  normalizedText: text.toLowerCase(),
  header: null,
  footer: null,
  headings: [],
  sectionAtTop: null,
  checkboxes,
  figures: [],
  minConfidence: null,
  lowConfidenceSpans: []
})

const packet: FilePages[] = [
  {
    file: { id: "f1", fileName: "form.pdf", mediaType: "application/pdf", contextText: null, status: "ready" },
    pages: [page(1, "Fence application", [{ label: "Photos included", state: "unselected" }]), page(2, "  ")],
    visuals: [
      { figureId: "1.1", pageIndex: 1, description: "A plat map", measurements: [{ label: "Rear", value: "60 ft" }] }
    ],
    kinds: new Map([[1, "application-form"]])
  },
  {
    file: {
      id: "f2",
      fileName: "picture-1.png",
      mediaType: "image/png",
      contextText: "Copy of the new fence",
      status: "ready"
    },
    pages: [page(1, "")],
    visuals: [{ figureId: "image", pageIndex: 1, description: "Horizontal boards", measurements: [] }]
  },
  {
    file: { id: "f3", fileName: "scan.tif.pdf", mediaType: "application/pdf", contextText: null, status: "unreadable" },
    pages: [],
    visuals: []
  }
]

const byId = (id: string) => fenceRules.find((rule) => rule.id === id)!

describe("pagesForPrompt", () => {
  it("marks every page with its file, page and kind, with descriptions and context", () => {
    const text = pagesForPrompt(packet)
    expect(text).toContain('<<file f1 "form.pdf" | page 1 | application-form>>\nFence application')
    expect(text).toContain("[image 1.1] A plat map Measurements: Rear: 60 ft.")
    expect(text).toContain('<<file f1 "form.pdf" | page 2>>\n[no text]')
    expect(text).toContain("Text near this picture in its Word file: Copy of the new fence")
    expect(text).toContain('<<file f3 "scan.tif.pdf" | page 1>>\n[This file couldn\'t be read.]')
  })

  it("lists checkbox states", () => {
    expect(checkboxesForPrompt(packet)).toBe('<<file f1 "form.pdf" | page 1>> Photos included: unselected')
    expect(checkboxesForPrompt([])).toBe("none")
  })
})

describe("rulebook inputs", () => {
  it("collects listed values per attribute, merging aliases", () => {
    const values = JSON.parse(allowedValuesForPrompt(fenceRules)) as Record<
      string,
      { value: string; aliases: string[] }[]
    >
    expect(values["segment.manufacturer"]?.map((value) => value.value)).toEqual(
      expect.arrayContaining(["Trex", "Frame It All", "Neoline"])
    )
    expect(values["segment.color"]?.map((value) => value.value)).toContain("Winchester Grey")
    expect(values["segment.material"]?.map((value) => value.value)).toContain("vinyl")
  })

  it("lists text conditions and required documents per component", () => {
    const visible = {
      ...byId("posts"),
      appliesWhen: [{ type: "text" as const, id: "posts:c0", description: "Visible from the street" }]
    }
    expect(JSON.parse(textConditionsForPrompt([visible]))).toEqual([
      { id: "posts:c0", appliesTo: "segment", description: "Visible from the street" }
    ])
    expect(textConditionsForPrompt([byId("posts")])).toBe("none")
    const requirements = JSON.parse(
      requirementsForPrompt(
        "fence",
        [byId("neighbor-approval")],
        [
          { id: "segment-1", kind: "segment", label: "Left" },
          { id: "gate-1", kind: "gate", label: "Gate" }
        ]
      )
    ) as { requirement: string; componentId: string | null; signedBy: string }[]
    expect(requirements).toEqual([
      expect.objectContaining({ requirement: "neighbor-approval", componentId: "segment-1", signedBy: "neighbor" })
    ])
    expect(informationalRulesForPrompt(fenceRules)).toContain(byId("like-for-like").statement)
    expect(informationalRulesForPrompt([byId("posts")])).toBe("none")
  })
})

describe("facts and findings", () => {
  const owners = (fact: Partial<Fact>): Fact[] => [
    {
      attribute: "project.ownersOfRecord",
      componentId: null,
      value: 2,
      rawValue: "Two owners",
      valueMatch: null,
      status: "conflicting",
      evidence: [],
      ...fact
    }
  ]

  it("reads the owners of record", () => {
    expect(ownersOfRecord(owners({}))).toBe("Two owners")
    expect(ownersOfRecord(owners({ rawValue: null }))).toBe("2")
    expect(ownersOfRecord(owners({ status: "not-provided" }))).toBe("not given")
    expect(ownersOfRecord([])).toBe("not given")
  })

  it("gives a file the kind its pages share", () => {
    expect(fileKindOf(["photo", "photo"])).toBe("photo")
    expect(fileKindOf(["photo", "letter"])).toBeNull()
    expect(fileKindOf([])).toBeNull()
  })

  it("gives the writer applicable findings and phrases action items by id", () => {
    const findings: Finding[] = [
      {
        id: "posts:segment-1",
        ruleId: "posts",
        componentId: "segment-1",
        status: "needs-committee",
        explanation: "Post color isn't given.",
        evidence: [],
        documentProblems: [],
        decidedBy: "code"
      },
      {
        id: "no-vinyl:segment-1",
        ruleId: "no-vinyl",
        componentId: "segment-1",
        status: "not-applicable",
        explanation: "",
        evidence: [],
        documentProblems: [],
        decidedBy: "code"
      }
    ]
    const forWriter = JSON.parse(findingsForWriter(findings, fenceRules)) as { rule: string }[]
    expect(forWriter).toEqual([expect.objectContaining({ rule: byId("posts").title, status: "needs-committee" })])

    const decision = decide(findings, fenceRules, {
      curableOutcome: "approve-with-conditions",
      retentionDays: 365,
      draftRetentionDays: 30
    })
    expect(JSON.parse(actionItemsForPrompt(decision)).committeeDecisions).toHaveLength(1)
    const phrased = phraseItems(decision.committeeDecisions, [{ id: "committee:posts", text: "Should posts match?" }])
    expect(phrased[0]?.text).toBe("Should posts match?")
    expect(phraseItems(decision.committeeDecisions, [{ id: "committee:posts", text: "  " }])[0]?.text).toBe(
      decision.committeeDecisions[0]?.text
    )
  })

  it("asks for confirmation when a review still requests information", () => {
    expect(hasOpenRequests({ recommendation: "request-information", missingInformation: [] })).toBe(true)
    expect(
      hasOpenRequests({ recommendation: "approve", missingInformation: [{ id: "x", findingIds: [], text: "x" }] })
    ).toBe(true)
    expect(hasOpenRequests({ recommendation: "approve-with-conditions", missingInformation: [] })).toBe(false)
  })
})
