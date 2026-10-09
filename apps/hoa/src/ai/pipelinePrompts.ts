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
  // Evaluation round 1 (implementation-plan.md): the judge comparing the build's rules with the golden encoding's.
  encodingJudge: { name: "hoa-eval-encoding-judge", variables: ["provision", "referenceRules", "pipelineRules"] },
  // The application review (application-review.md). The subjects and facts calls also receive the packet's images.
  pageClassification: {
    name: "hoa-page-classification",
    variables: ["documentTypes", "contextText", "visualDescriptions", "pageText"]
  },
  subjectIdentification: {
    name: "hoa-subject-identification",
    variables: ["requestType", "projectKind", "description", "candidateTypes", "pages"]
  },
  entityFacts: {
    name: "hoa-entity-facts",
    variables: ["requestType", "description", "entities", "properties", "textConditions", "pages"]
  },
  documentReview: { name: "hoa-document-review", variables: ["requirements", "parties", "pages"] },
  judgmentCheck: {
    name: "hoa-judgment-check",
    variables: ["statement", "question", "subject", "facts", "evidencePages"]
  },
  reviewSummary: {
    name: "hoa-review-summary",
    variables: ["recommendation", "findings", "actionItems", "suggestions"]
  },
  // Evaluation round 2 (implementation-plan.md): the judge of the writer's faithfulness and clarity. It reads what the
  // writer read, with the writer's phrasing of each action item, and the assessment and feedback.
  reviewJudge: {
    name: "hoa-eval-review-judge",
    variables: ["recommendation", "findings", "actionItems", "suggestions", "writing"]
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

/** The prompts an application review pins in resolve-prompts: OCR's visual descriptions, then the review's own. */
export const applicationReviewPrompts = [
  pipelinePrompts.visualDescription,
  pipelinePrompts.pageClassification,
  pipelinePrompts.subjectIdentification,
  pipelinePrompts.entityFacts,
  pipelinePrompts.documentReview,
  pipelinePrompts.judgmentCheck,
  pipelinePrompts.reviewSummary
] as const
