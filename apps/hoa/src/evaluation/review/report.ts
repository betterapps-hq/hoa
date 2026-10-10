import type { ModelCall } from "@/jobs/steps"
import type { ReviewScore, ReviewScores } from "./score"

// The Markdown report of an evaluation round 2 run: the scores code computes per case against the round's bars, the
// cost, and the mismatches behind each score. The writer's faithfulness and clarity are judged by the coding agent from
// each case's writer.md (writerComparison.ts). It names rules, properties and entity ids, never packet text.

export type CaseReport = {
  id: string
  title: string
  score: ReviewScore
  recommendation: string
  calls: readonly ModelCall[]
  failures: readonly { stage: string; itemId: string; message: string }[]
  durationSeconds: number
}

/** The bars of evaluation round 2's scores that code computes (implementation-plan.md, Evaluation round 2). */
export const bars: Record<keyof ReviewScores, number> = {
  entities: 1,
  facts: 0.9,
  documents: 0.9,
  normalization: 0.98,
  evidence: 0.95,
  findings: 0.95,
  recommendation: 1,
  actionItems: 0.95
}

const measures = Object.keys(bars).filter((key): key is keyof ReviewScores => key in bars)
const format = (value: number | null) => (value === null ? "-" : value.toFixed(2))
const sum = (values: readonly (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

export const costOf = (calls: readonly ModelCall[]) => sum(calls.map((call) => call.costUsd))

export function reviewReport(
  runId: string,
  promptVersions: Readonly<Record<string, number>>,
  cases: readonly CaseReport[]
) {
  const header = `| Case | ${measures.join(" | ")} | Cost |`
  const rows = cases.map(
    (item) =>
      `| ${item.id} | ${measures.map((measure) => format(item.score.scores[measure])).join(" | ")} | $${costOf(item.calls).toFixed(4)} |`
  )
  const details = cases.flatMap((item) => {
    const { mismatches } = item.score
    const list = <T>(title: string, entries: readonly T[], line: (entry: T) => string) =>
      entries.length === 0 ? [] : [`**${title}**`, "", ...entries.map((entry) => `- ${line(entry)}`), ""]
    return [
      `## ${item.id}: ${item.title}`,
      "",
      `Recommendation ${item.recommendation}; ${item.calls.length} model calls (${item.calls.filter((call) => call.isCached).length} cached), $${costOf(item.calls).toFixed(4)}, ${sum(item.calls.map((call) => call.inputTokens))} input and ${sum(item.calls.map((call) => call.outputTokens))} output tokens, ${item.durationSeconds.toFixed(0)} s.`,
      "",
      `Entities aligned: ${Object.entries(item.score.alignment)
        .filter(([wanted]) => !["request", "lot", "community"].includes(wanted))
        .map(([wanted, actual]) => `${wanted} = ${actual}`)
        .join(", ")}.`,
      "",
      ...list(
        "Entity counts",
        mismatches.entities,
        (entry) => `${entry.type}: expected ${entry.expected}, found ${entry.actual}`
      ),
      ...list(
        "Facts",
        mismatches.facts,
        (entry) =>
          `${entry.entity} ${entry.property}: expected ${entry.expected}, found ${entry.actual.join("; ") || "nothing"}`
      ),
      ...list(
        "Documents",
        mismatches.documents,
        (entry) => `${entry.ruleKey} ${entry.entity}: expected present ${entry.present}, found ${entry.actual}`
      ),
      ...list(
        "Findings",
        mismatches.findings,
        (entry) => `${entry.ruleKey} ${entry.entity}: expected ${entry.expected}, found ${entry.actual ?? "no finding"}`
      ),
      ...list("Action items missing", mismatches.actionItems.missing, (entry) => entry),
      ...list("Action items extra", mismatches.actionItems.extra, (entry) => entry),
      ...list("Failures", item.failures, (entry) => `${entry.stage} ${entry.itemId}: ${entry.message}`)
    ]
  })
  return [
    `# Review evaluation ${runId}`,
    "",
    `Prompts: ${Object.entries(promptVersions)
      .map(([name, version]) => `${name} v${version}`)
      .join(", ")}. Total cost $${sum(cases.map((item) => costOf(item.calls))).toFixed(4)}.`,
    "",
    "The writer's faithfulness and clarity are judged by the coding agent from each case's writer.md (evaluation.md, Judging by the coding agent).",
    "",
    header,
    `| --- | ${measures.map(() => "---").join(" | ")} | --- |`,
    `| bar | ${measures.map((measure) => format(bars[measure])).join(" | ")} | |`,
    ...rows,
    "",
    ...details
  ].join("\n")
}
