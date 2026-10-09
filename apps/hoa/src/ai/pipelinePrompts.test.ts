import { describe, expect, it } from "vitest"
import { applicationReviewPrompts, pipelinePrompts, rulebookBuildPrompts } from "./pipelinePrompts"
import { contractProblem } from "./promptLoader"

// The build's prompts fill exactly the variables encoding.md lists (Prompts and models), and the loader refuses a
// Langfuse version that uses any other.
describe("rulebook build prompts", () => {
  it("are registered with the variables the code fills in", () => {
    expect(Object.fromEntries(rulebookBuildPrompts.map((prompt) => [prompt.name, prompt.variables]))).toEqual({
      "hoa-structure-repair": ["documentTitle", "pageText", "parserOutline", "problems"],
      "hoa-term-extraction": ["document", "definitions", "candidates", "coreTerms"],
      "hoa-provision-encoding": [
        "document",
        "provisions",
        "context",
        "references",
        "terms",
        "coreTerms",
        "requestTypes"
      ],
      "hoa-encoding-repair": ["draft", "problems", "terms", "coreTerms"],
      "hoa-rulebook-consolidation": ["rules", "termPairs", "documents"]
    })
  })

  it("include the encoding judge with the variables the evaluation fills in", () => {
    expect(pipelinePrompts.encodingJudge).toEqual({
      name: "hoa-eval-encoding-judge",
      variables: ["provision", "referenceRules", "pipelineRules"]
    })
  })

  it("refuse a version whose text uses another variable or leaves one out", () => {
    const prompt = pipelinePrompts.encodingRepair
    expect(contractProblem(prompt, "{{draft}} {{problems}} {{terms}} {{coreTerms}}")).toBeNull()
    expect(contractProblem(prompt, "{{draft}} {{problems}} {{terms}}")).toContain("doesn't use {{coreTerms}}")
    expect(contractProblem(prompt, "{{draft}} {{problems}} {{terms}} {{coreTerms}} {{fence-run}}")).toContain(
      "{{fence-run}}"
    )
  })
})

// The review's prompts fill exactly the variables application-review.md lists (Prompts and models).
describe("application review prompts", () => {
  it("are registered with the variables the code fills in", () => {
    expect(Object.fromEntries(applicationReviewPrompts.map((prompt) => [prompt.name, prompt.variables]))).toEqual({
      "hoa-visual-description": ["documentKind", "contextText", "ocrText"],
      "hoa-page-classification": ["documentTypes", "contextText", "visualDescriptions", "pageText"],
      "hoa-subject-identification": ["requestType", "projectKind", "description", "candidateTypes", "pages"],
      "hoa-entity-facts": ["requestType", "description", "entities", "properties", "textConditions", "pages"],
      "hoa-document-review": ["requirements", "parties", "pages"],
      "hoa-judgment-check": ["statement", "question", "subject", "facts", "evidencePages"],
      "hoa-review-summary": ["recommendation", "findings", "actionItems", "suggestions"]
    })
  })

  it("include the writer's judge with the variables the evaluation fills in", () => {
    expect(pipelinePrompts.reviewJudge).toEqual({
      name: "hoa-eval-review-judge",
      variables: ["recommendation", "findings", "actionItems", "suggestions", "writing"]
    })
  })
})
