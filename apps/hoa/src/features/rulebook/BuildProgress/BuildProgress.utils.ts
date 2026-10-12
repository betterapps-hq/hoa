import { stageLabel } from "@/features/jobs/JobProgress/JobProgress.utils"
import type { Job } from "@/jobs/job"
import type { JobProgress, JobStep } from "@/jobs/progress"
import type { BuildResult } from "@/rulebook/buildResults"

// The build's progress for people (encoding.md, UX, The build's progress): the job's stages grouped into a few steps
// in plain words, each done, current, upcoming or skipped, and one estimate of the time left for the whole build.

/** How the build's stages read: consecutive stages with the same words are one step. */
const stepWords: Record<string, { label: string; counted?: [string, string] }> = {
  "resolve-prompts": { label: "Reading documents" },
  check: { label: "Reading documents" },
  structure: { label: "Reading documents" },
  analyze: { label: "Reading documents" },
  "defined-terms": { label: "Finding defined terms", counted: ["document", "documents"] },
  plan: { label: "Finding rules" },
  "find-rules": { label: "Finding rules", counted: ["section", "sections"] },
  vocabulary: { label: "Building the vocabulary", counted: ["group of sections", "groups of sections"] },
  "vocabulary-merge": { label: "Building the vocabulary" },
  "structure-rules": { label: "Drafting rules", counted: ["batch of rules", "batches of rules"] },
  merge: { label: "Combining and checking for conflicts" },
  consolidate: { label: "Combining and checking for conflicts" },
  "save-draft": { label: "Saving the draft" }
}

export type BuildStep = {
  label: string
  status: JobStep["status"]
  /** A step that runs only when there's something for it to do. */
  isOptional: boolean
  /** "47 of 64 sections, 4 under way", for a step with countable work under way or done. */
  count: string | null
  /** How much of the step's countable work is done, from 0 to 1, while it runs; null otherwise. */
  fraction: number | null
  /** What the step has produced so far, as a count: "112 rules found", "40 of 112 rules drafted". */
  found: string | null
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The newest result of each section E looked at: a rerun replaces its first answer. */
function latestOutlines(results: readonly BuildResult[]) {
  const bySection = new Map<string, Extract<BuildResult, { kind: "outlines" }>>()
  for (const result of results) {
    if (result.kind !== "outlines") {
      continue
    }
    const seen = bySection.get(result.unitId)
    if (!seen || result.at > seen.at) {
      bySection.set(result.unitId, result)
    }
  }
  return [...bySection.values()]
}

/** What each step has produced so far, by the step's label, as counts from the build's results. */
export function stepFindings(results: readonly BuildResult[]): Record<string, string> {
  const findings: Record<string, string> = {}
  const definedTerms = new Set(results.flatMap((result) => (result.kind === "terms" ? result.labels : [])))
  if (results.some((result) => result.kind === "terms")) {
    findings["Finding defined terms"] = `${counted(definedTerms.size, "term", "terms")} found`
  }
  const outlines = latestOutlines(results)
  const ruleCount = outlines.reduce((sum, result) => sum + result.rules.length, 0)
  if (outlines.length > 0) {
    findings["Finding rules"] = `${counted(ruleCount, "rule", "rules")} found`
  }
  // A group looked at again lists its terms again: each term counts once.
  const vocabulary = results.flatMap((result) => (result.kind === "vocabulary" ? [result.labels] : []))
  if (vocabulary.length > 0) {
    findings["Building the vocabulary"] = counted(new Set(vocabulary.flat()).size, "term", "terms")
  }
  const drafted = new Set(
    results.flatMap((result) => (result.kind === "rules" ? result.rules.map((rule) => rule.key) : []))
  )
  if (results.some((result) => result.kind === "rules")) {
    findings["Drafting rules"] =
      ruleCount > 0
        ? `${drafted.size} of ${ruleCount} rules drafted`
        : `${counted(drafted.size, "rule", "rules")} drafted`
  }
  const combined =
    results.find((result) => result.kind === "consolidated") ?? results.find((result) => result.kind === "combined")
  if (combined && (combined.kind === "consolidated" || combined.kind === "combined")) {
    findings["Combining and checking for conflicts"] =
      combined.conflicts === 0 ? "No conflicts" : `${counted(combined.conflicts, "conflict", "conflicts")} to decide`
  }
  return findings
}

function groupStatus(steps: readonly JobStep[]): JobStep["status"] {
  if (steps.some((step) => step.status === "current")) {
    return "current"
  }
  if (steps.every((step) => step.status === "skipped")) {
    return "skipped"
  }
  if (steps.every((step) => step.status === "done" || step.status === "skipped")) {
    return "done"
  }
  // Some stages done and the rest not started: the job is between two of them.
  return steps.some((step) => step.status === "done") ? "current" : "upcoming"
}

/**
 * The job's stages as steps in plain words, in order, each with what it has produced so far. A stage with no words of
 * its own is a step by itself.
 */
export function buildSteps(progress: JobProgress, results: readonly BuildResult[] = []): BuildStep[] {
  const findings = stepFindings(results)
  const groups: { label: string; steps: JobStep[] }[] = []
  for (const step of progress.steps) {
    const label = stepWords[step.stage]?.label ?? stageLabel(step.stage)
    const last = groups.at(-1)
    if (last?.label === label) {
      last.steps.push(step)
    } else {
      groups.push({ label, steps: [step] })
    }
  }
  return groups.map(({ label, steps }) => {
    const status = groupStatus(steps)
    const work = steps.find((step) => stepWords[step.stage]?.counted && step.total > 0 && step.status !== "upcoming")
    const words = work ? stepWords[work.stage]?.counted : undefined
    const isRunning = work?.status === "current"
    // The calls in flight: the job runs at most `concurrency` at once, so a step reads as working before its first
    // call finishes.
    const underWay = work && isRunning ? Math.min(work.total - work.done, progress.workload.concurrency) : 0
    return {
      label,
      status,
      isOptional: steps.every((step) => step.isOptional),
      count:
        work && words
          ? `${status === "done" ? work.total : work.done} of ${work.total} ${work.total === 1 ? words[0] : words[1]}${underWay > 0 ? `, ${underWay} under way` : ""}`
          : null,
      fraction: work && isRunning ? work.done / work.total : null,
      found: findings[label] ?? null
    }
  })
}

export type Range = { low: number; high: number }

/**
 * How long one model call of each stage takes, in minutes (implementation-log.md, the step runs). The estimate starts
 * from them and is corrected by the build's own pace once sections are done.
 */
const callMinutes: Record<string, Range> = {
  "defined-terms": { low: 1, high: 2 },
  "find-rules": { low: 1, high: 3 },
  vocabulary: { low: 2, high: 4 },
  "vocabulary-merge": { low: 1, high: 2 },
  "structure-rules": { low: 1, high: 2 },
  consolidate: { low: 1, high: 3 }
}
/** Rounds of reruns or retries a stage may add after its first calls. */
const extraRounds: Record<string, number> = {
  "defined-terms": 1,
  "find-rules": 1,
  vocabulary: 1,
  "structure-rules": 2
}
/** Sections C groups together at most, and outlines a batch of F holds, for the counts not known yet. */
const sectionsPerGroup = 4
const sectionsPerBatch = 3

const scale = (range: Range, by: number): Range => ({ low: range.low * by, high: range.high * by })
const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high })
const middle = (range: Range) => (range.low + range.high) / 2

/** Minutes for a stage's `calls` model calls at most `concurrency` at a time, with its reruns at most. */
function callTime(stage: string, calls: number, concurrency: number): Range {
  const minutes = callMinutes[stage] ?? { low: 1, high: 3 }
  const rounds = Math.ceil(calls / concurrency)
  return { low: rounds * minutes.low, high: (rounds + (extraRounds[stage] ?? 0)) * minutes.high }
}

type Workload = JobProgress["workload"] & { sections: number | null; batches: number | null }

/** What a stage takes before it starts, in minutes; null while it depends on a count not known yet. */
function expectedMinutes(stage: string, workload: Workload): Range | null {
  const { concurrency, documents, sections, batches } = workload
  switch (stage) {
    case "structure":
      return { low: 0.2 * documents, high: documents }
    case "defined-terms":
      return callTime(stage, documents, concurrency)
    case "find-rules":
      return sections === null ? null : callTime(stage, sections, concurrency)
    case "vocabulary":
      return sections === null ? null : callTime(stage, Math.ceil(sections / sectionsPerGroup), concurrency)
    case "structure-rules": {
      const count = batches ?? (sections === null ? null : Math.ceil(sections / sectionsPerBatch))
      return count === null ? null : callTime(stage, count, concurrency)
    }
    case "vocabulary-merge":
    case "consolidate":
      return callTime(stage, 1, concurrency)
    case "save-draft":
      return { low: 0.3, high: 1 }
    case "resolve-prompts":
    case "analyze":
    case "plan":
    case "merge":
      return { low: 0.1, high: 0.5 }
    default:
      return { low: 0.5, high: 2 }
  }
}

const minutesBetween = (from: string, to: number) => Math.max(0, (to - Date.parse(from)) / 60_000)

/** Model stages after finding the rules, whose expected time follows the build's own pace. */
const pacedStages = new Set(["vocabulary", "vocabulary-merge", "structure-rules", "consolidate"])

export type BuildEstimate = {
  /** Minutes since the build started. */
  elapsed: number
  /** Minutes left, as a range; null until finding the rules says how many sections there are. */
  remaining: Range | null
  /** How far along the whole build is, from 0 to at most 0.95: the bar is never full before the build ends. */
  fraction: number
}

/**
 * The time left for the whole build: each upcoming stage's expected time, the current stage's remaining time at its
 * own pace once it has done some of its work, and, once finding or drafting the rules has a pace (drafting's, once it
 * has one), the later model stages scaled by how that pace compares with the expectation.
 */
export function estimateBuild(job: Pick<Job, "createdAt" | "progress">, now: number): BuildEstimate {
  const elapsed = minutesBetween(job.createdAt, now)
  const progress = job.progress
  if (!progress) {
    return { elapsed, remaining: null, fraction: 0 }
  }
  const stepOf = (stage: string) => progress.steps.find((step) => step.stage === stage)
  const counted = (stage: string) => {
    const step = stepOf(stage)
    return step && step.total > 0 ? step.total : null
  }
  const workload: Workload = {
    ...progress.workload,
    sections: counted("find-rules"),
    batches: counted("structure-rules")
  }

  /** How a stage's pace compares with its expectation, once it has done some of its work. */
  const paceOf = (stage: string) => {
    const step = stepOf(stage)
    const expected = expectedMinutes(stage, workload)
    if (!step?.startedAt || step.done === 0 || !expected) {
      return null
    }
    const spent = step.finishedAt
      ? minutesBetween(step.startedAt, Date.parse(step.finishedAt))
      : minutesBetween(step.startedAt, now)
    const projected = (spent / step.done) * step.total
    return Math.min(3, Math.max(0.5, projected / middle(expected)))
  }
  const pace = paceOf("structure-rules") ?? paceOf("find-rules") ?? 1

  let remaining: Range | null = { low: 0, high: 0 }
  for (const step of progress.steps) {
    if (remaining === null || step.status === "done" || step.status === "skipped") {
      continue
    }
    const expected = expectedMinutes(step.stage, workload)
    if (step.status === "current" && step.startedAt) {
      const spent = minutesBetween(step.startedAt, now)
      if (step.total > 0 && step.done > 0) {
        const left = (spent / step.done) * (step.total - step.done)
        remaining = add(remaining, { low: left * 0.8, high: left * 1.3 })
        continue
      }
      if (expected) {
        const low = Math.max(0.2, expected.low - spent)
        remaining = add(remaining, { low, high: Math.max(low + 0.5, expected.high - spent) })
        continue
      }
    }
    remaining = expected ? add(remaining, pacedStages.has(step.stage) ? scale(expected, pace) : expected) : null
  }

  const steps = progress.steps.length
  const finished = progress.steps.filter((step) => step.status === "done" || step.status === "skipped").length
  const total = remaining === null ? 0 : elapsed + middle(remaining)
  let fraction = (finished / Math.max(1, steps)) * 0.5
  if (remaining !== null) {
    fraction = total > 0 ? elapsed / total : 0
  }
  return { elapsed, remaining, fraction: Math.min(0.95, Math.max(0, fraction)) }
}

const roundTo = (value: number, step: number, round: (value: number) => number) => round(value / step) * step

/** "About 35–50 minutes left", rounded to five minutes past ten. */
export function timeLeftText(remaining: Range | null) {
  if (remaining === null) {
    return "Working out how long this takes"
  }
  if (remaining.high <= 2) {
    return "About a minute or two left"
  }
  const isLong = remaining.low >= 10
  const low = isLong ? roundTo(remaining.low, 5, Math.floor) : Math.max(1, Math.floor(remaining.low))
  const high = isLong ? roundTo(remaining.high, 5, Math.ceil) : Math.ceil(remaining.high)
  return low >= high ? `About ${high} minutes left` : `About ${low}–${high} minutes left`
}

/** "12 minutes so far". */
export function elapsedText(minutes: number) {
  const whole = Math.floor(minutes)
  if (whole < 1) {
    return "Started just now"
  }
  if (whole < 60) {
    return `${whole} ${whole === 1 ? "minute" : "minutes"} so far`
  }
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  const hourText = `${hours} ${hours === 1 ? "hour" : "hours"}`
  return `${rest === 0 ? hourText : `${hourText} ${rest} ${rest === 1 ? "minute" : "minutes"}`} so far`
}

/** "Finding rules, step 3 of 7, about 35–50 minutes left": the build in one line. */
export function summaryText(steps: readonly BuildStep[], remaining: Range | null) {
  const current = steps.find((step) => step.status === "current") ?? steps.find((step) => step.status === "upcoming")
  const position = current ? `${current.label}, step ${steps.indexOf(current) + 1} of ${steps.length}` : "Finishing"
  const left = timeLeftText(remaining)
  return `${position}, ${left.charAt(0).toLowerCase()}${left.slice(1)}`
}
