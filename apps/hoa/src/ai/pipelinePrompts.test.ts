import { describe, expect, it } from "vitest"
import { applicationReviewPrompts, pipelinePrompts, rulebookBuildPrompts } from "./pipelinePrompts"
import { contractProblem } from "./promptLoader"

// The build's prompts fill exactly the variables encoding.md lists (Prompts and models), and the loader refuses a
// Langfuse version that uses any other.
describe("rulebook build prompts", () => {
  it("are registered with the variables the code fills in", () => {
    expect(Object.fromEntries(rulebookBuildPrompts.map((prompt) => [prompt.name, prompt.variables]))).toEqual({
      "hoa-structure-repair": ["documentTitle", "pageText", "parserOutline", "problems"],
      "hoa-defined-terms": ["coreTerms", "document", "definitions", "candidates", "problems"],
      "hoa-rule-finding": [
        "coreTerms",
        "requestTypes",
        "knownTerms",
        "documents",
        "definitions",
        "context",
        "references",
        "provisions",
        "problems"
      ],
      "hoa-vocabulary-group": [
        "coreTerms",
        "requestTypes",
        "definedTerms",
        "previousVocabulary",
        "documents",
        "outlines",
        "provisions",
        "problems"
      ],
      "hoa-vocabulary-merge": ["clusters"],
      "hoa-rule-structuring": [
        "coreTerms",
        "requestTypes",
        "vocabulary",
        "documents",
        "provisions",
        "outlines",
        "relatedRules",
        "settingsFlags",
        "problems"
      ],
      "hoa-consolidation": ["documents", "crossReferences", "exceptions", "rulePairs", "rules"]
    })
  })

  it("refuse a version whose text uses another variable or leaves one out", () => {
    const prompt = pipelinePrompts.structureRepair
    const text = "{{documentTitle}} {{pageText}} {{parserOutline}} {{problems}}"
    expect(contractProblem(prompt, text)).toBeNull()
    expect(contractProblem(prompt, "{{documentTitle}} {{pageText}} {{parserOutline}}")).toContain(
      "doesn't use {{problems}}"
    )
    expect(contractProblem(prompt, `${text} {{fence-run}}`)).toContain("{{fence-run}}")
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
})

describe("project type prompts", () => {
  it("are registered with the variables the code fills in", () => {
    expect(pipelinePrompts.projectTypeSuggestion).toEqual({
      name: "hoa-project-type-suggestion",
      variables: ["rulebook", "projectTypes"]
    })
  })
})
