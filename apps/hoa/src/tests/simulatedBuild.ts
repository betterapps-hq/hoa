import type { Job } from "@/jobs/job"
import { advanceProgress, finishProgress, startProgress } from "@/jobs/progress"
import type { BuildResult } from "@/rulebook/buildResults"

// Sudden Valley's rulebook build replayed, for stories: one six-page declaration in 17 minutes. Each stage reports
// when the real build's did, in seconds from the start, and each step writes its results then. The counts are the real
// build's (182 terms, 95 rules); the names are placeholders, since the progress shows only counts.

/** How long the build took, in seconds. */
export const simulatedBuildSeconds = 1025

const reports: { stage: string; done: number; total: number; at: number }[] = [
  { stage: "resolve-prompts", done: 0, total: 0, at: 0 },
  { stage: "check", done: 0, total: 1, at: 0.5 },
  { stage: "structure", done: 0, total: 1, at: 1.2 },
  { stage: "analyze", done: 0, total: 1, at: 2.2 },
  { stage: "defined-terms", done: 0, total: 1, at: 2.8 },
  { stage: "defined-terms", done: 1, total: 1, at: 15.8 },
  { stage: "plan", done: 0, total: 1, at: 16 },
  { stage: "find-rules", done: 0, total: 2, at: 17 },
  { stage: "find-rules", done: 1, total: 2, at: 150 },
  { stage: "find-rules", done: 2, total: 2, at: 279 },
  { stage: "vocabulary", done: 0, total: 4, at: 280 },
  { stage: "vocabulary", done: 1, total: 4, at: 420 },
  { stage: "vocabulary", done: 2, total: 4, at: 560 },
  { stage: "vocabulary", done: 3, total: 4, at: 700 },
  { stage: "vocabulary", done: 4, total: 4, at: 803 },
  { stage: "vocabulary-merge", done: 0, total: 1, at: 804 },
  { stage: "vocabulary-merge", done: 1, total: 1, at: 817 },
  { stage: "structure-rules", done: 0, total: 9, at: 818 },
  ...Array.from({ length: 9 }, (_, index) => ({
    stage: "structure-rules",
    done: index + 1,
    total: 9,
    at: 839 + index * 21
  })),
  { stage: "merge", done: 0, total: 1, at: 1009 },
  { stage: "consolidate", done: 0, total: 1, at: 1010 },
  { stage: "consolidate", done: 1, total: 1, at: 1023 },
  { stage: "save-draft", done: 0, total: 1, at: 1024 }
]

const stages = [...new Set(reports.map((report) => report.stage))].map((stage) => ({
  stage,
  isOptional: stage === "vocabulary-merge"
}))

/** Terms `from` to `to`, numbered across the build so a term two steps name counts once. */
const terms = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `Term ${from + index}`)
const rules = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    key: `declaration:${from + index}#rule`,
    title: `Rule ${from + index}`,
    provisionKey: null
  }))

/** Each batch of drafted rules, as many as the real build's nine batches held. */
const batchSizes = [11, 11, 10, 11, 10, 11, 10, 11, 10]
const batchStarts = batchSizes.map((_, index) => 1 + batchSizes.slice(0, index).reduce((sum, size) => sum + size, 0))

type Written = { at: number; result: BuildResult }

const written: Written[] = [
  {
    at: 15.8,
    result: { id: "defined-terms", at: "", kind: "terms", documentKey: "declaration", labels: terms(1, 18) }
  },
  {
    at: 150,
    result: { id: "find-rules-1", at: "", kind: "outlines", unitId: "one", rules: rules(1, 50), isRerun: false }
  },
  {
    at: 279,
    result: { id: "find-rules-2", at: "", kind: "outlines", unitId: "two", rules: rules(51, 95), isRerun: false }
  },
  ...[
    [420, 5, 60],
    [560, 55, 110],
    [700, 100, 150],
    [803, 140, 182]
  ].map(([at = 0, from = 0, to = 0], index) => ({
    at,
    result: {
      id: `vocabulary-${index + 1}`,
      at: "",
      kind: "vocabulary" as const,
      unitId: `group-${index + 1}`,
      labels: terms(from, to)
    }
  })),
  ...batchSizes.map((size, index) => {
    const first = batchStarts[index] ?? 1
    return {
      at: 839 + index * 21,
      result: {
        id: `structure-rules-${index + 1}`,
        at: "",
        kind: "rules" as const,
        batchId: `batch-${index + 1}`,
        rules: rules(first, first + size - 1),
        round: 0
      }
    }
  }),
  { at: 1009.5, result: { id: "merge", at: "", kind: "combined", conflicts: 0 } },
  { at: 1023, result: { id: "consolidate", at: "", kind: "consolidated", problems: 0, conflicts: 0 } }
]

const isoAt = (now: number, seconds: number, at: number) => new Date(now - (seconds - at) * 1000).toISOString()

/** The build `seconds` in: running until it finishes, with every stage that has reported. */
export function simulatedJob(seconds: number, now = Date.now()): Job {
  const reached = reports.filter((report) => report.at <= seconds)
  const progress = reached.reduce(
    (current, report) => advanceProgress(current, report, isoAt(now, seconds, report.at)),
    startProgress(stages, { concurrency: 4, documents: 1 })
  )
  const isFinished = seconds >= simulatedBuildSeconds
  const last = reached.at(-1)
  return {
    id: "simulated-build",
    hoaId: "hoa",
    kind: "rulebook-build",
    subjectId: "draft",
    status: isFinished ? "completed" : "running",
    stage: isFinished ? null : (last?.stage ?? null),
    done: last?.done ?? 0,
    total: last?.total ?? 0,
    promptVersions: {},
    failures: [],
    error: null,
    progress: isFinished ? finishProgress(progress, isoAt(now, seconds, simulatedBuildSeconds)) : progress,
    createdAt: isoAt(now, seconds, 0),
    updatedAt: isoAt(now, seconds, last?.at ?? 0)
  }
}

/** What the build has written `seconds` in. */
export function simulatedResults(seconds: number, now = Date.now()): BuildResult[] {
  return written
    .filter((item) => item.at <= seconds)
    .map((item) => ({ ...item.result, at: isoAt(now, seconds, item.at) }))
}
