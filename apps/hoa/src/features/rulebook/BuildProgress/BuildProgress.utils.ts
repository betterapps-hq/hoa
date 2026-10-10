import { stageLabel } from "@/features/jobs/JobProgress/JobProgress.utils"
import type { Job } from "@/jobs/job"
import type { JobProgress, JobStep } from "@/jobs/progress"

// The build's progress for people (encoding.md, UX, The build's progress): the job's stages grouped into a few steps
// in plain words, each done, current, upcoming or skipped, and one estimate of the time left for the whole build.

/** How the build's stages read: consecutive stages with the same words are one step. */
const stepWords: Record<string, { label: string; counted?: [string, string] }> = {
  "resolve-prompts": { label: "Reading documents" },
  check: { label: "Reading documents" },
  structure: { label: "Reading documents" },
  analyze: { label: "Reading documents" },
  vocabulary: { label: "Finding defined terms" },
  plan: { label: "Drafting rules" },
  encode: { label: "Drafting rules", counted: ["section", "sections"] },
  verify: { label: "Checking drafts" },
  repair: { label: "Fixing problems", counted: ["section", "sections"] },
  merge: { label: "Combining and checking for conflicts" },
  consolidate: { label: "Combining and checking for conflicts" },
  "save-draft": { label: "Saving the draft" }
}

export type BuildStep = {
  label: string
  status: JobStep["status"]
  /** A step that runs only when there's something for it to do. */
  isOptional: boolean
  /** "47 of 64 sections", for a step with countable work under way or done. */
  count: string | null
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

/** The job's stages as steps in plain words, in order. A stage with no words of its own is a step by itself. */
export function buildSteps(progress: JobProgress): BuildStep[] {
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
    const counted = steps.find((step) => stepWords[step.stage]?.counted && step.total > 0 && step.status !== "upcoming")
    const words = counted ? stepWords[counted.stage]?.counted : undefined
    return {
      label,
      status,
      isOptional: steps.every((step) => step.isOptional),
      count:
        counted && words
          ? `${status === "done" ? counted.total : counted.done} of ${counted.total} ${counted.total === 1 ? words[0] : words[1]}`
          : null
    }
  })
}

export type Range = { low: number; high: number }

/**
 * How long one Opus encoding call takes, in minutes: about 22,000 tokens written at high effort (encoding.md, Cost and
 * scale). The estimate starts from it and is corrected by the build's own pace once sections are done.
 */
const callMinutes: Range = { low: 3, high: 5 }
/** Calls per section while drafting: the encode, and a first repair for some (measured: 130 to 180 calls for 64). */
const draftCallsPerSection: Range = { low: 1.3, high: 1.8 }
/** Sections the second repair round takes up, of all of them. */
const secondRepairShare: Range = { low: 0, high: 0.4 }

const scale = (range: Range, by: number): Range => ({ low: range.low * by, high: range.high * by })
const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high })
const middle = (range: Range) => (range.low + range.high) / 2

/** Minutes for `calls` model calls at most `concurrency` at a time. */
function callTime(calls: Range, concurrency: number): Range {
  return {
    low: Math.ceil(calls.low / concurrency) * callMinutes.low,
    high: Math.ceil(calls.high / concurrency) * callMinutes.high
  }
}

type Workload = JobProgress["workload"] & { sections: number | null }

/** What a stage takes before it starts, in minutes; null while it depends on a count not known yet. */
function expectedMinutes(stage: string, workload: Workload): Range | null {
  const { concurrency, documents, sections } = workload
  switch (stage) {
    case "structure":
      return { low: 0.2 * documents, high: documents }
    case "vocabulary":
      return scale(callMinutes, documents)
    case "encode":
      return sections === null ? null : callTime(scale(draftCallsPerSection, sections), concurrency)
    case "repair":
      return sections === null ? null : callTime(scale(secondRepairShare, sections), concurrency)
    case "consolidate":
      return { low: 2, high: 5 }
    case "save-draft":
      return { low: 0.3, high: 1 }
    case "resolve-prompts":
    case "analyze":
    case "plan":
    case "verify":
    case "merge":
      return { low: 0.1, high: 0.5 }
    default:
      return { low: 0.5, high: 2 }
  }
}

const minutesBetween = (from: string, to: number) => Math.max(0, (to - Date.parse(from)) / 60_000)

/** Model stages after drafting, whose expected time follows the build's own pace. */
const pacedStages = new Set(["repair", "consolidate"])

export type BuildEstimate = {
  /** Minutes since the build started. */
  elapsed: number
  /** Minutes left, as a range; null until the plan says how many sections there are. */
  remaining: Range | null
  /** How far along the whole build is, from 0 to at most 0.95: the bar is never full before the build ends. */
  fraction: number
}

/**
 * The time left for the whole build: each upcoming stage's expected time, the current stage's remaining time at its
 * own pace once it has done some of its work, and, once drafting has a pace, the later model stages scaled by how its
 * pace compares with the expectation.
 */
export function estimateBuild(job: Pick<Job, "createdAt" | "progress">, now: number): BuildEstimate {
  const elapsed = minutesBetween(job.createdAt, now)
  const progress = job.progress
  if (!progress) {
    return { elapsed, remaining: null, fraction: 0 }
  }
  const encode = progress.steps.find((step) => step.stage === "encode")
  const workload: Workload = { ...progress.workload, sections: encode && encode.total > 0 ? encode.total : null }

  let pace = 1
  const expectedEncode = expectedMinutes("encode", workload)
  if (encode?.startedAt && encode.done > 0 && expectedEncode) {
    const spent = encode.finishedAt
      ? minutesBetween(encode.startedAt, Date.parse(encode.finishedAt))
      : minutesBetween(encode.startedAt, now)
    const projected = (spent / encode.done) * encode.total
    pace = Math.min(3, Math.max(0.5, projected / middle(expectedEncode)))
  }

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

/** "Drafting rules, step 3 of 7, about 35–50 minutes left": the build in one line. */
export function summaryText(steps: readonly BuildStep[], remaining: Range | null) {
  const current = steps.find((step) => step.status === "current") ?? steps.find((step) => step.status === "upcoming")
  const position = current ? `${current.label}, step ${steps.indexOf(current) + 1} of ${steps.length}` : "Finishing"
  const left = timeLeftText(remaining)
  return `${position}, ${left.charAt(0).toLowerCase()}${left.slice(1)}`
}
