import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useMemo, useState } from "react"
import { fn } from "storybook/test"
import { Button } from "@/components/ui/button"
import { simulatedBuildSeconds, simulatedJob } from "@/tests/simulatedBuild"
import { readingDocuments, readingResults } from "@/tests/simulatedReading"
import { BuildProgress } from "../BuildProgress/BuildProgress"
import { BuildReader } from "./BuildReader"

// A build of Maple Hollow's made-up declaration (src/tests/simulatedReading.ts), timed like Sudden Valley's, as the
// reader shows it, replayed faster than it ran. The results are polled every 4 seconds, as the app polls them, so what
// the build names arrives in the bursts it does on the page.

const meta = {
  component: BuildReader,
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    )
  ],
  args: { results: readingResults(600), documents: readingDocuments(600), isRunning: true }
} satisfies Meta<typeof BuildReader>

export default meta
type Story = StoryObj<typeof meta>

const pollMs = 4000

/** How far into the build a replay is: `from` seconds in when it started, then `speed` times faster than it ran. */
const replayedSeconds = (start: number, speed: number, from: number) =>
  Math.min(simulatedBuildSeconds, from + ((Date.now() - start) / 1000) * speed)

/** The build replayed `speed` times faster than it ran, from `from` seconds in, polled as the app polls. */
function useReplay(speed: number, from: number) {
  const [start] = useState(() => Date.now())
  const [poll, setPoll] = useState(() => ({ seconds: from, results: readingResults(from) }))
  useEffect(() => {
    const take = () => {
      const seconds = replayedSeconds(start, speed, from)
      setPoll({ seconds, results: readingResults(seconds) })
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
  withProgress?: boolean
}

/** A replay with a way to start it again. */
function Replay(props: ReplayProps) {
  const [run, setRun] = useState(0)
  return <Replaying key={run} {...props} onReplay={() => setRun((count) => count + 1)} />
}

function Replaying({ speed, from = 0, withProgress = false, onReplay }: ReplayProps & { onReplay: () => void }) {
  const replay = useReplay(speed, from)
  // The documents come once the build has read them, as the app would load them.
  const hasDocuments = readingDocuments(replay.seconds).length > 0
  const documents = useMemo(() => (hasDocuments ? readingDocuments(simulatedBuildSeconds) : []), [hasDocuments])
  const minutes = Math.floor(replay.seconds / 60)
  return (
    <div className="flex flex-col gap-6">
      <BuildReader results={replay.results} documents={documents} isRunning={replay.isRunning} />
      {withProgress ? (
        <BuildProgress
          jobId={`replay-${speed}`}
          loadJob={async () => simulatedJob(replay.now())}
          loadResults={async () => ({ results: readingResults(replay.now()), cursor: null, documents: [] })}
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

/** The whole build in about two minutes. */
export const Replayed: Story = {
  render: () => <Replay speed={8} />
}

/** From just before the first section's answer, slowly: each passage scanned, then its verdict. */
export const ReplayedSlowly: Story = {
  render: () => <Replay speed={3} from={140} />
}

/** Building the vocabulary: each term the rules read, marked where the declaration first uses it. */
export const ReplayedFromTheVocabulary: Story = {
  render: () => <Replay speed={2} from={410} />
}

/** The last three minutes: each rule's statement filling in, two drafted again after a check, then the end. */
export const ReplayedFromDrafting: Story = {
  render: () => <Replay speed={2} from={830} />
}

/** The last batch drafted, then the check: two drafts have a problem and are drafted again, as they ran. */
export const ReplayedFromTheCheck: Story = {
  render: () => <Replay speed={1} from={1000} />
}

/** Where it would sit: above the build's progress, both following the same build. */
export const WithTheBuildProgress: Story = {
  render: () => <Replay speed={8} withProgress />
}

export const ReplayedOnAPhone: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-[343px]">
        <Story />
      </div>
    )
  ],
  render: () => <Replay speed={8} />
}

/** Opened partway through a build: what's been found shows without flying in again, and the window reads on. */
export const PartwayThrough: Story = {}

export const Finished: Story = {
  args: {
    results: readingResults(simulatedBuildSeconds),
    documents: readingDocuments(simulatedBuildSeconds),
    isRunning: false
  }
}
