import type { BuildResult, BuildStage } from "./build"

// The build's scores (encoding.md, Quality): sent to Langfuse on the build's root span, so every build and evaluation
// run can be compared on the rules it outlined and structured validly, the reruns and retries it needed, coverage,
// what it encoded and the gaps it found.

export type BuildScore = { name: string; value: number; comment?: string }

/** How many `{ type: "text" }` conditions a value holds, wherever they sit. */
function textConditions(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + textConditions(item), 0)
  }
  if (typeof value !== "object" || value === null) {
    return 0
  }
  const own = "type" in value && value.type === "text" && "text" in value ? 1 : 0
  return Object.values(value).reduce((sum: number, item) => sum + textConditions(item), own)
}

export function buildScores(result: Pick<BuildResult, "content" | "issues" | "report">): BuildScore[] {
  const { content, report } = result
  const { rules } = content
  const count = (predicate: (rule: (typeof rules)[number]) => boolean) => rules.filter(predicate).length
  const stage = (name: BuildStage) => report.stages.find((item) => item.stage === name)
  const problemsAfter =
    result.issues.validator.length + result.issues.conflicts.length + result.issues.consolidation.length
  const covered = content.coverage.provisions - content.coverage.uncovered.length
  return [
    { name: "sections", value: stage("find-rules")?.items ?? 0 },
    { name: "outlines", value: report.rules.length },
    { name: "rules-valid", value: report.rules.filter((rule) => rule.isValid).length },
    { name: "rules-retried", value: report.rules.filter((rule) => rule.retries > 0).length },
    {
      name: "reruns",
      value: report.stages.reduce((sum, item) => sum + item.reruns, 0),
      comment: report.stages.map((item) => `${item.stage} ${item.reruns}`).join(", ")
    },
    { name: "problems-before-retry", value: stage("structure-rules")?.problems ?? 0 },
    { name: "problems-after-retry", value: problemsAfter },
    {
      name: "coverage",
      value: content.coverage.provisions === 0 ? 1 : covered / content.coverage.provisions,
      comment: `${content.coverage.uncovered.length} of ${content.coverage.provisions} provisions uncovered`
    },
    { name: "rules", value: rules.length },
    ...(["norm", "discretion", "sanction", "limit"] as const).map((kind) => ({
      name: `rules-${kind}`,
      value: count((rule) => rule.kind === kind)
    })),
    { name: "rules-requirement", value: count((rule) => rule.kind === "norm" && rule.modality === "requirement") },
    { name: "rules-approval", value: count((rule) => rule.kind === "norm" && rule.check?.type === "approval") },
    { name: "terms", value: content.terms.length },
    { name: "text-conditions", value: textConditions(rules) },
    { name: "schema-gap-notes", value: report.notes.filter((note) => note.startsWith("SCHEMA GAP")).length }
  ]
}
