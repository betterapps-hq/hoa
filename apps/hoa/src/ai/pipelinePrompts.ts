import type { PromptDefinition } from "./prompts"

// The pipeline's prompts (docs/design/encoding.md, application-review.md and ocr.md, "Prompts and models"). Their text
// lives in Langfuse; each entry names the prompt and the `{{variables}}` the code fills in, which the Langfuse prompt
// must use exactly. Every prompt is generic: HOA rules and applications arrive as data.

export const pipelinePrompts = {
  /** Also receives the image as an attachment. */
  visualDescription: { name: "hoa-visual-description", variables: ["documentKind", "contextText", "ocrText"] },
  // The rulebook build (encoding.md).
  structureRepair: {
    name: "hoa-structure-repair",
    variables: ["documentTitle", "pageText", "parserOutline", "problems"]
  },
  termExtraction: { name: "hoa-term-extraction", variables: ["document", "definitions", "candidates", "coreTerms"] },
  provisionEncoding: {
    name: "hoa-provision-encoding",
    variables: ["document", "provisions", "context", "references", "terms", "coreTerms", "requestTypes"]
  },
  encodingRepair: { name: "hoa-encoding-repair", variables: ["draft", "problems", "terms", "coreTerms"] },
  rulebookConsolidation: { name: "hoa-rulebook-consolidation", variables: ["rules", "termPairs", "documents"] },
  // The first build's application review, until phase 6 replaces it.
  fileClassification: {
    name: "hoa-file-classification",
    variables: ["fileKinds", "contextText", "visualDescriptions", "checkboxCount", "pageText"]
  },
  /** Also receives the packet's images as attachments. */
  factExtraction: {
    name: "hoa-fact-extraction",
    variables: ["projectType", "catalog", "allowedValues", "textConditions", "description", "pages"]
  },
  documentCheck: { name: "hoa-document-check", variables: ["requirements", "ownersOfRecord", "checkboxes", "pages"] },
  qualitativeCheck: {
    name: "hoa-qualitative-check",
    variables: ["ruleStatement", "criterion", "component", "facts", "evidencePages"]
  },
  reviewWriter: {
    name: "hoa-review-writer",
    variables: ["recommendation", "findings", "facts", "actionItems", "informationalRules"]
  }
} as const satisfies Record<string, PromptDefinition>

/** The prompts a rulebook build pins in resolve-prompts. */
export const rulebookBuildPrompts = [
  pipelinePrompts.structureRepair,
  pipelinePrompts.termExtraction,
  pipelinePrompts.provisionEncoding,
  pipelinePrompts.encodingRepair,
  pipelinePrompts.rulebookConsolidation
] as const
