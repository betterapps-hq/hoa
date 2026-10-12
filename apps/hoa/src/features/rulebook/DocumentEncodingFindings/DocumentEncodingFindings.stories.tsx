import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { fn } from "storybook/test"
import { Button } from "@/components/ui/button"
import { simulatedBuildSeconds, simulatedJob, simulatedResults } from "@/tests/simulatedBuild"
import { DocumentEncodingSteps } from "../DocumentEncodingSteps/DocumentEncodingSteps"
import { findingCounts, type FindingCounts } from "../DocumentEncodingSteps/DocumentEncodingSteps.utils"
import { DocumentEncodingFindings } from "./DocumentEncodingFindings"

// Sudden Valley's build (src/tests/simulatedBuild.ts) as the picture shows it, replayed faster than it ran. The results
// are polled every 4 seconds, as the app polls them, so finds arrive in the bursts they do on the page.

const meta = {
  component: DocumentEncodingFindings,
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    )
  ],
  args: { counts: findingCounts(simulatedResults(600)), documents: 1, isRunning: true }
} satisfies Meta<typeof DocumentEncodingFindings>

export default meta
type Story = StoryObj<typeof meta>

const pollMs = 4000

/** How far into the build a replay is: `from` seconds in when it started, then `speed` times faster than it ran. */
const replayedSeconds = (start: number, speed: number, from: number) =>
  Math.min(simulatedBuildSeconds, from + ((Date.now() - start) / 1000) * speed)

/** The build replayed `speed` times faster than it ran, from `from` seconds in, polled as the app polls. */
function useReplay(speed: number, from: number) {
  const [start] = useState(() => Date.now())
  const [poll, setPoll] = useState(() => ({ seconds: from, results: simulatedResults(from) }))
  useEffect(() => {
    const take = () => {
      const seconds = replayedSeconds(start, speed, from)
      setPoll({ seconds, results: simulatedResults(seconds) })
    }
    take()
    const timer = setInterval(take, pollMs)
    return () => clearInterval(timer)
  }, [start, speed, from])
  return { ...poll, isRunning: poll.seconds < simulatedBuildSeconds, now: () => replayedSeconds(start, speed, from) }
}

type ReplayProps = {
  speed: number
  /** Seconds into the build to start from. */
  from?: number
  /** Multiplies the counts, for an association with more documents. */
  scale?: number
  documents?: number
  withProgress?: boolean
}

/** A replay with a way to start it again. */
function Replay(props: ReplayProps) {
  const [run, setRun] = useState(0)
  return <Replaying key={run} {...props} onReplay={() => setRun((count) => count + 1)} />
}

function Replaying({
  speed,
  from = 0,
  scale = 1,
  documents = 1,
  withProgress = false,
  onReplay
}: ReplayProps & { onReplay: () => void }) {
  const replay = useReplay(speed, from)
  const counts = scaled(findingCounts(replay.results), scale)
  const minutes = Math.floor(replay.seconds / 60)
  return (
    <div className="flex flex-col gap-6">
      <DocumentEncodingFindings counts={counts} documents={documents} isRunning={replay.isRunning} />
      {withProgress ? (
        <DocumentEncodingSteps
          jobId={`replay-${speed}`}
          loadJob={async () => simulatedJob(replay.now())}
          onFinished={fn()}
          onStop={async () => undefined}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {replay.isRunning ? `${minutes} of 17 minutes in` : "Finished after 17 minutes"}, at {speed} times speed
        </span>
        <Button variant="outline" size="sm" onClick={onReplay}>
          Replay
        </Button>
      </div>
    </div>
  )
}

const scaled = (counts: FindingCounts, by: number): FindingCounts => ({
  terms: counts.terms * by,
  rulesFound: counts.rulesFound * by,
  rulesDrafted: counts.rulesDrafted * by
})

/** The whole build in about 45 seconds. */
export const Replayed: Story = {
  render: () => <Replay speed={24} />
}

/** The same, slower, to watch single finds land and rules fill as they're drafted. */
export const ReplayedSlowly: Story = {
  render: () => <Replay speed={8} />
}

/** The last four minutes, slowly: the rules fill in as they're drafted, then the build finishes. */
export const ReplayedFromDrafting: Story = {
  render: () => <Replay speed={8} from={800} />
}

/** Where it would sit: above the build's progress, both following the same build. */
export const WithTheDocumentEncodingSteps: Story = {
  render: () => <Replay speed={24} withProgress />
}

/** An association five times the size, in three documents: the dots shrink to keep every find in the picture. */
export const ReplayedForALargeAssociation: Story = {
  render: () => <Replay speed={24} scale={5} documents={3} />
}

export const ReplayedOnAPhone: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-[343px]">
        <Story />
      </div>
    )
  ],
  render: () => <Replay speed={24} />
}

/** Opened partway through a build: what's been found shows without flying in again. */
export const PartwayThrough: Story = {}

export const Finished: Story = {
  args: { counts: findingCounts(simulatedResults(simulatedBuildSeconds)), isRunning: false }
}

/** The sample association's full build: 892 terms and 617 rules. */
export const LargeAssociation: Story = {
  args: { counts: { terms: 892, rulesFound: 617, rulesDrafted: 240 }, documents: 3 }
}
