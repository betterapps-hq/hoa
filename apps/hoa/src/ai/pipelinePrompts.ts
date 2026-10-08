import type { PromptDefinition } from "./prompts"

// The pipeline's prompts (docs/design/extraction.md, review.md and ocr.md, "Prompts and models"). Their text lives in
// Langfuse; each entry names the prompt and the variables the code fills in. Every prompt is generic: HOA rules and
// applications arrive as data.

export const pipelinePrompts = {
  /** Variables: documentKind, contextText, ocrText; plus the image. */
  visualDescription: { name: "hoa-visual-description" },
  /** Variables: projectTypes, topics, documentKind, heading, sectionText. */
  sectionRouting: { name: "hoa-section-routing" },
  /** Variables: documentKind, heading, sectionText, definitions, references, catalog. */
  sectionRuleExtraction: { name: "hoa-section-rule-extraction" },
  /** Variables: projectType, candidates. */
  ruleConsolidation: { name: "hoa-rule-consolidation" },
  /** Variables: fileKinds, contextText, visualDescriptions, checkboxCount, pageText. */
  fileClassification: { name: "hoa-file-classification" },
  /** Variables: projectType, catalog, allowedValues, textConditions, description, pages; plus the images. */
  factExtraction: { name: "hoa-fact-extraction" },
  /** Variables: requirements, ownersOfRecord, checkboxes, pages. */
  documentCheck: { name: "hoa-document-check" },
  /** Variables: ruleStatement, criterion, component, facts, evidencePages. */
  qualitativeCheck: { name: "hoa-qualitative-check" },
  /** Variables: recommendation, findings, facts, actionItems, informationalRules. */
  reviewWriter: { name: "hoa-review-writer" }
} satisfies Record<string, PromptDefinition>
