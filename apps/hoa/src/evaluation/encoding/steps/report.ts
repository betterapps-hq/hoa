import { z } from "zod"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import type { Tags } from "./datasets"
import type { ItemScore, Verdict } from "./scores"

// The datasets' summary per step and the comparison file per item (evaluation.md, Datasets): item counts by slice,
// each old run's (or a new step run's) accuracy per metric and per slice, and the items every run got wrong, which are
// the most useful test items. The comparison files hold what code can't judge, for the coding agent.

/** A metric across a step run's repeats: its mean, min and max (null where no repeat measured it). */
export type Spread = { mean: number; min: number; max: number }

export type ItemResult = {
  id: string
  tags: Tags
  /** Each metric across the repeats, when a step ran more than once: the run-to-run noise. */
  repeats?: Record<string, Spread>
  results: Record<string, ItemScore>
}

const spread = z.object({ mean: z.number(), min: z.number(), max: z.number() })

/** Item results as results.json stores them. */
export const itemResults = z.array(
  z.object({
    id: z.string(),
    tags: z.object({
      document: z.string(),
      split: z.string(),
      topics: z.array(z.string()),
      features: z.array(z.string())
    }),
    repeats: z.record(z.string(), spread).optional(),
    results: z.record(
      z.string(),
      z.object({
        verdict: z.enum(["correct", "partly", "wrong", "missing", "no-equivalent"]),
        metrics: z.record(z.string(), z.number().nullable()),
        notes: z.array(z.string())
      })
    )
  })
)

const verdicts: Verdict[] = ["correct", "partly", "wrong", "missing", "no-equivalent"]
function number(value: number | null) {
  if (value === null) {
    return "-"
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

/** The slices an item belongs to: its document, split, each topic and each feature. */
export const slicesOf = (tags: Tags) => [
  `document ${tags.document}`,
  `split ${tags.split}`,
  ...tags.topics.map((topic) => `topic ${topic}`),
  ...tags.features.map((feature) => `feature ${feature}`)
]

function mean(values: readonly (number | null | undefined)[]) {
  const present = values.filter((value): value is number => typeof value === "number")
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length
}

/** Accuracy figures of one run over a set of items: verdict counts, the share correct, and each metric's mean. */
export function accuracy(items: readonly ItemResult[], run: string) {
  const scores = items.map((item) => item.results[run]).filter((score): score is ItemScore => score !== undefined)
  const counts = Object.fromEntries(
    verdicts.map((verdict) => [verdict, scores.filter((score) => score.verdict === verdict).length])
  )
  const judged = scores.filter((score) => score.verdict !== "missing" && score.verdict !== "no-equivalent")
  const metricNames = [...new Set(scores.flatMap((score) => Object.keys(score.metrics)))].toSorted(compareCodeUnits)
  return {
    counts,
    correct: judged.length === 0 ? null : judged.filter((score) => score.verdict === "correct").length / judged.length,
    metrics: Object.fromEntries(metricNames.map((name) => [name, mean(scores.map((score) => score.metrics[name]))]))
  }
}

/** Each metric's mean, min and max over several runs' values (a run that didn't measure it left out). */
export function repeatSpread(runs: readonly Record<string, number | null | undefined>[]): Record<string, Spread> {
  const names = [...new Set(runs.flatMap((metrics) => Object.keys(metrics)))].toSorted(compareCodeUnits)
  return Object.fromEntries(
    names.flatMap((name) => {
      const values = runs.map((metrics) => metrics[name]).filter((value): value is number => typeof value === "number")
      return values.length === 0
        ? []
        : [
            [
              name,
              {
                mean: values.reduce((sum, value) => sum + value, 0) / values.length,
                min: Math.min(...values),
                max: Math.max(...values)
              }
            ]
          ]
    })
  )
}

/** A spread as text: "0.480 (0.470–0.490)". */
export const spreadText = (value: Spread) => `${number(value.mean)} (${number(value.min)}–${number(value.max)})`

/** One step's summary as Markdown. */
export function stepSummary(step: string, items: readonly ItemResult[], runs: readonly string[]) {
  const slices = [...new Set(items.flatMap((item) => slicesOf(item.tags)))].toSorted(compareCodeUnits)
  const overall = runs.map((run) => ({ run, ...accuracy(items, run) }))
  const metricNames = [...new Set(overall.flatMap((item) => Object.keys(item.metrics)))].toSorted(compareCodeUnits)
  const notCorrect = (item: ItemResult) => runs.every((run) => item.results[run]?.verdict !== "correct")
  const allWrong = items.filter(
    (item) => runs.length > 0 && runs.every((run) => item.results[run]?.verdict === "wrong")
  )
  return [
    `# Dataset ${step}`,
    "",
    `${items.length} items. Runs compared: ${runs.join(", ") || "none"}. Verdicts and metrics are code's; the comparison files in compare/ are for the coding agent (evaluation.md, Datasets).`,
    "",
    "## Verdicts",
    "",
    `| Run | ${verdicts.join(" | ")} | Correct of judged |`,
    `| --- | ${verdicts.map(() => "---").join(" | ")} | --- |`,
    ...overall.map(
      (item) =>
        `| ${item.run} | ${verdicts.map((verdict) => item.counts[verdict]).join(" | ")} | ${number(item.correct)} |`
    ),
    "",
    "## Metrics (mean over items)",
    "",
    `| Metric | ${runs.join(" | ")} |`,
    `| --- | ${runs.map(() => "---").join(" | ")} |`,
    ...metricNames.map(
      (name) => `| ${name} | ${overall.map((item) => number(item.metrics[name] ?? null)).join(" | ")} |`
    ),
    "",
    "## By slice (items; share correct of judged per run)",
    "",
    `| Slice | Items | ${runs.join(" | ")} |`,
    `| --- | --- | ${runs.map(() => "---").join(" | ")} |`,
    ...slices.map((slice) => {
      const inSlice = items.filter((item) => slicesOf(item.tags).includes(slice))
      return `| ${slice} | ${inSlice.length} | ${runs.map((run) => number(accuracy(inSlice, run).correct)).join(" | ")} |`
    }),
    "",
    `## Items every run got wrong (${allWrong.length})`,
    "",
    ...(allWrong.length === 0 ? ["- none"] : allWrong.map((item) => `- ${item.id}`)),
    "",
    `## Items no run got right (${items.filter(notCorrect).length})`,
    "",
    ...items
      .filter(notCorrect)
      .map((item) => `- ${item.id}: ${runs.map((run) => `${run} ${item.results[run]?.verdict ?? "-"}`).join(", ")}`),
    ""
  ].join("\n")
}

/** The longest input a comparison file shows. */
export const comparisonInputLimit = 200_000

/** An item's input for its comparison file, cut at `limit` characters with the cut said, never silently. */
export function clippedInput(text: string, limit = comparisonInputLimit) {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n[cut: ${text.length - limit} of ${text.length} characters not shown]`
}

/** A dataset item's comparison file: its input in brief, the expected output, and each run's output and score. */
export function itemComparison(input: {
  id: string
  tags: Tags
  inputText: string
  expected: unknown
  outputs: { run: string; output: unknown; score: ItemScore }[]
}) {
  return [
    `# ${input.id}`,
    "",
    `Slices: ${slicesOf(input.tags).join("; ")}.`,
    "",
    "Judge what code can't: whether each output is faithful to the text, and whether differing terms or rules mean the same (evaluation.md, Judging by the coding agent).",
    "",
    "## Input",
    "",
    "```text",
    input.inputText,
    "```",
    "",
    "## Expected (golden)",
    "",
    "```json",
    JSON.stringify(input.expected, null, 1),
    "```",
    "",
    ...input.outputs.flatMap(({ run, output, score }) => [
      `## ${run}: ${score.verdict}`,
      "",
      `Metrics: ${
        Object.entries(score.metrics)
          .map(([name, value]) => `${name} ${number(value)}`)
          .join(", ") || "none"
      }.`,
      "",
      ...(score.notes.length === 0 ? [] : [...score.notes.map((note) => `- ${note}`), ""]),
      "```json",
      output === null || output === undefined ? "null" : canonicalJson(output),
      "```",
      ""
    ])
  ].join("\n")
}

type CallLike = {
  isCached: boolean
  costUsd: number | null
  latencyMs: number
  inputTokens: number | null
  cachedInputTokens: number | null
  cacheWriteTokens: number | null
  outputTokens: number | null
}

/** A step run's calls: count, cached results, cost, time and tokens. */
export function callFigures(calls: readonly CallLike[]) {
  const sum = (pick: (call: CallLike) => number | null) => calls.reduce((total, call) => total + (pick(call) ?? 0), 0)
  return {
    calls: calls.length,
    cachedResults: calls.filter((call) => call.isCached).length,
    costUsd: sum((call) => call.costUsd),
    latencySeconds: sum((call) => call.latencyMs) / 1000,
    slowestSeconds: Math.max(0, ...calls.map((call) => call.latencyMs)) / 1000,
    inputTokens: sum((call) => call.inputTokens),
    cachedInputTokens: sum((call) => call.cachedInputTokens),
    cacheWriteTokens: sum((call) => call.cacheWriteTokens),
    outputTokens: sum((call) => call.outputTokens),
    largestOutput: Math.max(0, ...calls.map((call) => call.outputTokens ?? 0))
  }
}

/** Each metric's mean over items, as its mean with the min and max across the repeats (run-to-run noise). */
function repeatsSection(items: readonly ItemResult[], repeats: readonly string[]) {
  if (repeats.length < 2) {
    return []
  }
  const spreads = repeatSpread(repeats.map((run) => accuracy(items, run).metrics))
  return [
    `## Metrics across ${repeats.length} repeats (mean over items; mean, min–max across repeats)`,
    "",
    ...Object.entries(spreads).map(([name, value]) => `- ${name} ${spreadText(value)}`)
  ]
}

/** One step run's report: what ran, its calls, its problems by class, and its scores beside the old runs'. */
export function stepRunReport(input: {
  runId: string
  stage: string
  source: string
  promptVersions: Readonly<Record<string, number>>
  wallSeconds: number
  calls: readonly CallLike[]
  problems: readonly { code: string }[]
  /** This run's item results (each repeat a column), and the dataset's old-run results when there are any. */
  items: readonly ItemResult[]
  runs: readonly string[]
  /** The columns that are repeats of this run: each metric's mean over items is shown with its spread across them. */
  repeats?: readonly string[]
  extra: readonly string[]
}) {
  const figures = callFigures(input.calls)
  const classes = new Map<string, number>()
  for (const problem of input.problems) {
    classes.set(problem.code, (classes.get(problem.code) ?? 0) + 1)
  }
  return [
    `# Step run ${input.runId}`,
    "",
    `Step ${input.stage}, from ${input.source}. Prompts: ${
      Object.entries(input.promptVersions)
        .map(([name, version]) => `${name} v${version}`)
        .join(", ") || "by label"
    }.`,
    "",
    `${figures.calls} calls (${figures.cachedResults} from the content cache), $${figures.costUsd.toFixed(4)}, ${figures.latencySeconds.toFixed(0)} s of calls (slowest ${figures.slowestSeconds.toFixed(0)} s), ${input.wallSeconds.toFixed(0)} s in all; ${figures.inputTokens} input tokens (${figures.cachedInputTokens} read from the prompt cache, ${figures.cacheWriteTokens} written to it), ${figures.outputTokens} output tokens (largest answer ${figures.largestOutput}).`,
    "",
    `## Problems by class (${input.problems.length})`,
    "",
    ...(classes.size === 0
      ? ["- none"]
      : [...classes].toSorted(([a], [b]) => compareCodeUnits(a, b)).map(([code, count]) => `- ${code}: ${count}`)),
    "",
    ...input.extra,
    ...repeatsSection(input.items, input.repeats ?? []),
    "",
    stepSummary(input.stage, input.items, input.runs).replace(
      /^# Dataset .*\n/,
      "## Scores against the expected outputs\n"
    )
  ].join("\n")
}
