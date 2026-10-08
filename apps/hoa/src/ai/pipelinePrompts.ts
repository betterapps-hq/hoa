import type { PromptDefinition } from "./prompts"

// The pipeline's prompts (docs/design/extraction.md, review.md and ocr.md, "Prompts and models"). Their text lives in
// Langfuse; each entry names the prompt and the `{{variables}}` the code fills in, which the Langfuse prompt must use exactly. Every prompt is generic: HOA rules and
// applications arrive as data.

export const pipelinePrompts = {
  /** Also receives the image as an attachment. */
  visualDescription: { name: "hoa-visual-description", variables: ["documentKind", "contextText", "ocrText"] },
  sectionRouting: { name: "hoa-section-routing", variables: ["projectTypes", "topics", "heading", "sectionText"] },
  sectionRuleExtraction: {
    name: "hoa-section-rule-extraction",
    variables: ["documentKind", "heading", "sectionText", "definitions", "references", "catalog"]
  },
  ruleConsolidation: { name: "hoa-rule-consolidation", variables: ["projectType", "candidates"] },
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
