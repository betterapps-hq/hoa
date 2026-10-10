import type { PromptDefinition } from "@/ai/prompts"

// The reordered encoding pipeline's prompts (prompt drafts v2): B defined terms alongside E find the rules, then C
// shared vocabulary over E's outlines, C-merge, F structure the rules (its retry is the same prompt with problems),
// and consolidation. Each is a Langfuse chat prompt: a system message the build never varies, then a user message with
// the variables in XML tags, build-wide ones first (`sharedVariables`), so both the system message and the user
// message's shared part are cached (runPrompt.ts). Until they're wired into the build they run alone through
// `pnpm eval:step` (evaluation.md, Running one step), and then join pipelinePrompts. A version whose variables differ
// from these is refused when it loads (promptLoader.ts).

export const stepPrompts = {
  /** B. The things, parties and categories a document defines: hoa-term-extraction from its narrow version on. */
  definedTerms: {
    name: "hoa-term-extraction",
    variables: ["coreTerms", "document", "definitions", "candidates", "problems"],
    sharedVariables: ["coreTerms"],
    chat: true
  },
  /** E. Rule outlines with what each reads, settings flags or a no-rule reason, for every provision of a section. */
  ruleFinding: {
    name: "hoa-rule-finding",
    variables: [
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
    sharedVariables: ["coreTerms", "requestTypes", "knownTerms", "documents", "definitions"],
    chat: true
  },
  /** C. The terms one group of sections' outlines read, each with the outlines it serves. */
  sharedVocabulary: {
    name: "hoa-vocabulary-group",
    variables: [
      "coreTerms",
      "requestTypes",
      "definedTerms",
      "previousVocabulary",
      "documents",
      "outlines",
      "provisions",
      "problems"
    ],
    sharedVariables: ["coreTerms", "requestTypes", "definedTerms", "previousVocabulary", "documents"],
    chat: true
  },
  /** C-merge. Near-duplicates and same-key collisions, from term lines. */
  vocabularyMerge: { name: "hoa-vocabulary-merge", variables: ["clusters"], chat: true },
  /** F. The structure of a batch of fixed outlines; with problems, the retry of the rules that failed. */
  ruleStructuring: {
    name: "hoa-rule-structuring",
    variables: [
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
    sharedVariables: ["coreTerms", "requestTypes", "vocabulary", "documents"],
    chat: true
  },
  /** Consolidation over rule lines with their overrides, cross-references and similar pairs; no term merges. */
  consolidation: {
    name: "hoa-rulebook-consolidation",
    variables: ["documents", "crossReferences", "rulePairs", "rules"],
    chat: true
  }
} as const satisfies Record<string, PromptDefinition>

export type StepPromptName = keyof typeof stepPrompts

/** Each step prompt's trace name in Langfuse. */
export const stepTraceNames: Record<StepPromptName, string> = {
  definedTerms: "term-extraction",
  ruleFinding: "rule-finding",
  sharedVocabulary: "vocabulary-group",
  vocabularyMerge: "vocabulary-merge",
  ruleStructuring: "rule-structuring",
  consolidation: "rulebook-consolidation"
}

/** A variable with nothing in it, as every draft writes it. */
export const none = (text: string) => text || "none"
