import { describe, expect, it } from "vitest"
import { evaluate } from "@/engine/evaluate"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { judgmentCalls, judgmentPages, toJudgment } from "./judgments"
import { packetPageTexts, pagesForPrompt, type Packet } from "./packet"
import { verifyEvidence } from "./verifyEvidence"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const vocabulary = rulebookVocabulary(rulesFile)

describe("judgmentCalls", () => {
  it("asks only the judgments the engine left to the committee for want of an answer", () => {
    const answers = { ...fenceAnswers(), judgments: [] }
    const unjudged = evaluate({ rulesFile, request, answers, evaluatedAt: "2026-09-10T12:00:00Z" })
    const calls = judgmentCalls(unjudged, rulesFile.rules, vocabulary)
    expect(calls.map((call) => [call.ruleKey, call.entity, call.evidenceTerms])).toEqual([
      ["declaration:4.2(d)#reasonable-fees", "request", []],
      ["declaration:4.3(b)/p2#harmony", "work-1", ["plans", "photo"]]
    ])
    const judged = evaluate({ rulesFile, request, answers: fenceAnswers(), evaluatedAt: "2026-09-10T12:00:00Z" })
    expect(judgmentCalls(judged, rulesFile.rules, vocabulary).map((call) => [call.ruleKey, call.entity])).toEqual([
      ["declaration:4.2(d)#reasonable-fees", "request"]
    ])
    const [first] = calls
    if (!first) {
      throw new Error("Expected a judgment call.")
    }
    expect(toJudgment(first, { answer: "yes", confidence: 0.9, rationale: "Fits.", evidence: [] })).toMatchObject({
      ruleKey: "declaration:4.2(d)#reasonable-fees",
      entity: "request",
      answer: "yes"
    })
  })

  it("shows a judgment only the pages of the document types it names, or every page when none is", () => {
    const call = { ruleKey: "r#x", entity: "work-1", statement: "", question: "", evidenceTerms: ["photo", "plans"] }
    const types = new Map([["f", ["other", "photo", "plot-plan"]]])
    const includes = judgmentPages(call, [], types, vocabulary)
    expect([1, 2, 3].map((pageIndex) => includes({ fileId: "f", pageIndex }))).toEqual([false, true, true])
    const none = judgmentPages(call, [], new Map([["f", ["other"]]]), vocabulary)
    expect(none({ fileId: "f", pageIndex: 1 })).toBe(true)
    const drawings = judgmentPages(call, [], new Map([["f", ["other", "drawing"]]]), vocabulary, new Set(["drawing"]))
    expect([1, 2].map((pageIndex) => drawings({ fileId: "f", pageIndex }))).toEqual([false, true])
  })
})

describe("the packet as the models read it", () => {
  const page = (pageIndex: number, text: string) => ({
    documentId: "f",
    pageIndex,
    pageLabel: null,
    labelSource: null,
    engine: "test",
    optionsHash: "test",
    text,
    normalizedText: text,
    header: null,
    footer: null,
    headings: [],
    sectionAtTop: null,
    checkboxes: [],
    figures: [],
    minConfidence: null,
    lowConfidenceSpans: []
  })
  const packet: Packet = {
    files: [
      {
        id: "f",
        fileName: "appendix.docx",
        mediaType: "image/png",
        contextText: "A copy of the new fence",
        isReadable: true,
        pages: [page(1, "")],
        visuals: [{ figureId: "image", pageIndex: 1, description: "Horizontal composite boards.", measurements: [] }]
      },
      {
        id: "g",
        fileName: "scan.pdf",
        mediaType: "application/pdf",
        contextText: null,
        isReadable: false,
        pages: [],
        visuals: []
      }
    ],
    images: []
  }

  it("marks every page with its file, page and type, and says which files couldn't be read", () => {
    const text = pagesForPrompt(packet, new Map([["f", ["photo"]]]))
    expect(text).toContain('<<file f "appendix.docx" | page 1 | photo>>')
    expect(text).toContain("Text near this picture in its Word file: A copy of the new fence")
    expect(text).toContain("[image image] Horizontal composite boards.")
    expect(text).toContain('<<file g "scan.pdf" | page 1>>\n[This file couldn\'t be read.]')
  })

  it("verifies quotes against a page's text, the text near its picture and its images' descriptions, by file id or name", () => {
    const pageText = packetPageTexts(packet)
    const evidence = (quote: string, fileId = "f") => ({ fileId, page: 1, quote, region: null })
    expect(
      verifyEvidence(
        [
          evidence("horizontal composite boards"),
          evidence("copy of the new fence"),
          evidence("horizontal composite boards", "appendix"),
          evidence("vinyl"),
          evidence("x", "g")
        ],
        pageText
      )
    ).toEqual({ total: 5, found: 3 })
  })
})
