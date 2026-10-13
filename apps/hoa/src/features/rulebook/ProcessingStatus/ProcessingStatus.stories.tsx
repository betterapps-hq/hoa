import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState, type ReactNode } from "react"
import { fn } from "storybook/test"
import { Button } from "@/components/ui/button"
import { citationHref } from "@/features/documents/citationLink"
import type { Job } from "@/jobs/job"
import { simulatedBuildSeconds, simulatedJob } from "@/tests/simulatedBuild"
import { readingDocuments, readingResults } from "@/tests/simulatedReading"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { SkippedNotice } from "../SkippedNotice/SkippedNotice"
import { ProcessingStatus, type ProcessingStatusProps } from "./ProcessingStatus"

// The rulebook page's status while Maple Hollow's made-up declaration (src/tests/simulatedReading.ts) is processed,
// timed like Sudden Valley's build: the job, its results and its documents come from the same clock, polled as the
// page polls them.

/** A build held `seconds` in, or replayed from there `speed` times faster than it ran. */
function source(seconds: number, speed = 0): Pick<ProcessingStatusProps, "loadJob" | "loadResults" | "loadDocuments"> {
  const start = Date.now()
  const now = () => Math.min(simulatedBuildSeconds, seconds + ((Date.now() - start) / 1000) * speed)
  return {
    loadJob: async () => simulatedJob(now()),
    loadResults: async () => ({ results: readingResults(now()), cursor: null }),
    loadDocuments: async () => readingDocuments(now())
  }
}

const meta = {
  component: ProcessingStatus,
  // A story sets `width` to show it at another width.
  decorators: [
    (Story, { parameters }) => (
      <div className={typeof parameters.width === "string" ? parameters.width : "max-w-3xl"}>
        <Story />
      </div>
    )
  ],
  args: { jobId: "held", ...source(600), onFinished: fn(), onStop: fn(async () => undefined) }
} satisfies Meta<typeof ProcessingStatus>

export default meta
type Story = StoryObj<typeof meta>

/** The whole build at `speed` times its speed, with a way to start it again. */
function Replay({ speed, ...props }: ProcessingStatusProps & { speed: number }) {
  const [run, setRun] = useState(0)
  const [replay, setReplay] = useState(() => source(0, speed))
  const [minutes, setMinutes] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => setMinutes(Math.floor(((Date.now() - start) / 60_000) * speed)), 1000)
    return () => clearInterval(timer)
  }, [run, speed])
  return (
    <div className="flex flex-col gap-6">
      <ProcessingStatus key={run} {...props} {...replay} jobId={`replay-${run}`} />
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {Math.min(minutes, 17)} of 17 minutes in, at {speed} times speed
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setReplay(source(0, speed))
            setRun((count) => count + 1)
          }}
        >
          Replay
        </Button>
      </div>
    </div>
  )
}

/** The whole build in about four minutes. */
export const Replayed: Story = {
  render: (args) => <Replay {...args} speed={4} />
}

export const ReplayedOnAPhone: Story = {
  parameters: { width: "max-w-[375px]" },
  render: (args) => <Replay {...args} speed={4} />
}

/** Before the job and the documents come back. */
export const Starting: Story = {
  args: {
    loadJob: () => new Promise<Job | null>(() => undefined),
    loadResults: async () => ({ results: [], cursor: null }),
    loadDocuments: async () => []
  }
}

/** Opened partway through: what's been found shows without flying in again, and the reader reads on. */
export const PartwayThrough: Story = {}

// What the review says a build of Maple Hollow's declaration skipped, as `skippedParts` words it.
const skipped: SkippedPart[] = [
  {
    id: "find-rules section Declaration 3.1",
    stage: "find-rules",
    place: { label: "Declaration 3.1", href: citationHref("declaration", "declaration:3.1") },
    text: "not read for rules"
  },
  {
    id: "structure-rules rule Declaration 4.5",
    stage: "structure-rules",
    place: { label: "Declaration 4.5", href: citationHref("declaration", "declaration:4.5") },
    text: "1 rule not drafted"
  }
]

/** One state, named. */
function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      {children}
    </div>
  )
}

/** Processing from start to end, side by side: starting, partway, and done with parts skipped as the review says. */
export const EveryState: Story = {
  render: (args) => (
    <div className="flex flex-col gap-8">
      <State label="Starting">
        <ProcessingStatus
          {...args}
          jobId="every-state-starting"
          loadJob={() => new Promise<Job | null>(() => undefined)}
          loadResults={async () => ({ results: [], cursor: null })}
          loadDocuments={async () => []}
        />
      </State>
      <State label="Partway">
        <ProcessingStatus {...args} jobId="every-state-partway" />
      </State>
      <State label="Done, with parts skipped">
        <SkippedNotice parts={skipped} onRetry={fn()} />
      </State>
    </div>
  )
}
