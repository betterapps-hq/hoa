// The stages a rulebook build reports (encoding.md, Stages), apart from the build itself, so the page can list them
// without loading the build.

/** The job stages the build reports, in order (encoding.md, Stages). */
export const buildStages = [
  "check",
  "structure",
  "analyze",
  "defined-terms",
  "plan",
  "find-rules",
  "vocabulary",
  "vocabulary-merge",
  "structure-rules",
  "merge",
  "consolidate"
] as const
export type BuildStage = (typeof buildStages)[number]

/** Stages that may have nothing to do: C-merge runs only when the vocabulary has clusters to decide. */
export const optionalBuildStages: readonly BuildStage[] = ["vocabulary-merge"]

/** Every stage a rulebook build job works through, in order: resolving its prompts, the build, then saving the draft. */
export const rulebookBuildStages = ["resolve-prompts", ...buildStages, "save-draft"].map((stage) => ({
  stage,
  isOptional: optionalBuildStages.some((optional) => optional === stage)
}))
