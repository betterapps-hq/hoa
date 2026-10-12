import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { fn } from "storybook/test"
import type { Job } from "@/jobs/job"
import { simulatedBuildSeconds, simulatedJob } from "@/tests/simulatedBuild"
import { BuildProgress, type BuildProgressProps } from "./BuildProgress"

// Sudden Valley's build (src/tests/simulatedBuild.ts), held at a moment or replayed. The page polls the job as it does
// in the app.

type Source = Pick<BuildProgressProps, "loadJob">

/** The build held `seconds` in: its clock keeps moving, as a long step's does. */
function heldAt(seconds: number): Source {
  let now: number | null = null
  const startedAt = () => (now ??= Date.now())
  return {
    loadJob: async () => simulatedJob(seconds, startedAt())
  }
}

/** The build replayed `speed` times faster than it ran, from when the story opens. */
function replayed(speed: number): Source {
  const start = Date.now()
  const seconds = () => Math.min(simulatedBuildSeconds, ((Date.now() - start) / 1000) * speed)
  return {
    loadJob: async () => simulatedJob(seconds())
  }
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
    jobId: "simulated-build",
    ...heldAt(200),
    onFinished: fn(),
    onStop: fn(async () => undefined)
  }
} satisfies Meta<typeof BuildProgress>

export default meta
type Story = StoryObj<typeof meta>

/** Before the first poll comes back. */
export const Starting: Story = {
  args: { loadJob: () => new Promise<Job | null>(() => undefined) }
}

export const FindingDefinedTerms: Story = { args: heldAt(10) }

export const FindingRules: Story = {}

export const BuildingTheVocabulary: Story = { args: heldAt(600) }

export const DraftingRules: Story = { args: heldAt(900) }

export const CheckingForConflicts: Story = { args: heldAt(1015) }

/** Folded, the line names the step as well as the time left. */
export const StepsHidden: Story = {
  args: heldAt(900),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Hide steps" }))
  }
}

/** The whole build at 24 times its speed, about 45 seconds. Remount the story to replay it. */
export const Replay: Story = {
  render: (args) => <Replaying {...args} />
}

function Replaying(props: BuildProgressProps) {
  const [source] = useState(() => replayed(24))
  return <BuildProgress {...props} {...source} />
}
