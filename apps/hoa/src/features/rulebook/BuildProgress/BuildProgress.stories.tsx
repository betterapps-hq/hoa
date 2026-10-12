import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import type { Job } from "@/jobs/job"
import { advanceProgress, startProgress } from "@/jobs/progress"
import { BuildProgress, type BuildProgressProps } from "./BuildProgress"

// A rulebook build of one six-page declaration, on the timeline Sudden Valley's build took (17 minutes): when each
// stage started, in seconds from the start, and how many items it works through.
const timeline = [
  { stage: "resolve-prompts", at: 0, total: 0 },
  { stage: "check", at: 0.5, total: 1 },
  { stage: "structure", at: 1.2, total: 1 },
  { stage: "analyze", at: 2.2, total: 1 },
  { stage: "defined-terms", at: 2.8, total: 1 },
  { stage: "plan", at: 16, total: 1 },
  { stage: "find-rules", at: 17, total: 2 },
  { stage: "vocabulary", at: 280, total: 4 },
  { stage: "vocabulary-merge", at: 804, total: 1, isOptional: true },
  { stage: "structure-rules", at: 818, total: 9 },
  { stage: "merge", at: 1009, total: 1 },
  { stage: "consolidate", at: 1010, total: 1 },
  { stage: "save-draft", at: 1024, total: 1 }
]

/** The build `seconds` in, with `done` of the current stage's items finished. */
function runningJob(seconds: number, done: number): Job {
  const start = Date.now() - seconds * 1000
  const at = (offset: number) => new Date(start + offset * 1000).toISOString()
  const reached = timeline.filter((step) => step.at <= seconds)
  const progress = reached.reduce(
    (current, step, index) =>
      advanceProgress(
        current,
        { stage: step.stage, done: index === reached.length - 1 ? done : step.total, total: step.total },
        at(step.at)
      ),
    startProgress(timeline, { concurrency: 4, documents: 1 })
  )
  const current = reached.at(-1) ?? timeline[0]
  return {
    id: "build",
    hoaId: "hoa",
    kind: "rulebook-build",
    subjectId: "draft",
    status: "running",
    stage: current?.stage ?? null,
    done,
    total: current?.total ?? 0,
    promptVersions: {},
    failures: [],
    error: null,
    progress,
    createdAt: at(0),
    updatedAt: at(seconds)
  }
}

/** Polls give the same build each time; its clock keeps moving, as a long step's does. */
function loadingJob(seconds: number, done: number): BuildProgressProps["loadJob"] {
  let job: Job | null = null
  return async () => (job ??= runningJob(seconds, done))
}

const meta = {
  component: BuildProgress,
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    )
  ],
  args: {
    jobId: "build",
    loadJob: loadingJob(200, 1),
    onFinished: fn(),
    onStop: fn(async () => undefined),
    loadResults: async () => ({ results: [], cursor: null, documents: [] })
  }
} satisfies Meta<typeof BuildProgress>

export default meta
type Story = StoryObj<typeof meta>

/** Before the first poll comes back. */
export const Starting: Story = {
  args: { loadJob: () => new Promise<Job | null>(() => undefined) }
}

export const FindingDefinedTerms: Story = {
  args: { loadJob: loadingJob(10, 0) }
}

export const FindingRules: Story = {}

export const BuildingTheVocabulary: Story = {
  args: { loadJob: loadingJob(600, 2) }
}

export const DraftingRules: Story = {
  args: { loadJob: loadingJob(900, 3) }
}

/** Folded, the line names the step as well as the time left. */
export const StepsHidden: Story = {
  args: { loadJob: loadingJob(900, 3) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Hide steps" }))
  }
}
