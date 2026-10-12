import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { fn } from "storybook/test"
import { Button } from "@/components/ui/button"
import { citationHref } from "@/features/documents/citationLink"
import type { Job } from "@/jobs/job"
import { simulatedBuildSeconds, simulatedJob } from "@/tests/simulatedBuild"
import { readingDocuments, readingResults } from "@/tests/simulatedReading"
import { DocumentEncodingSteps } from "../DocumentEncodingSteps/DocumentEncodingSteps"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { SkippedNotice } from "../SkippedNotice/SkippedNotice"
import { DocumentEncodingReader } from "./DocumentEncodingReader"

// A build of Maple Hollow's made-up declaration (src/tests/simulatedReading.ts), timed like Sudden Valley's, as the
// reader shows it, replayed faster than it ran. The results are polled every 4 seconds, as the app polls them, so what
// the build names arrives in the bursts it does on the page.

const meta = {
  component: DocumentEncodingReader,
  // A story sets `width` to show it at another width.
  decorators: [
    (Story, { parameters }) => (
      <div className={typeof parameters.width === "string" ? parameters.width : "max-w-xl"}>
        <Story />
      </div>
    )
  ],
  args: { results: readingResults(600), documents: readingDocuments(600), isRunning: true }
} satisfies Meta<typeof DocumentEncodingReader>

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
  const reader = <DocumentEncodingReader results={replay.results} documents={documents} isRunning={replay.isRunning} />
  return (
    <div className="flex flex-col gap-6">
      {withProgress ? (
        // The rulebook page's status while it builds (RulebookPage), with the reader above the progress.
        <section aria-label="Status" className="flex flex-col gap-4 rounded-lg border p-5">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Processing your documents</p>
            <p className="text-sm text-muted-foreground">You can leave this page and come back.</p>
          </div>
          <div className="pb-2">{reader}</div>
          <div className="text-sm text-muted-foreground">
            <DocumentEncodingSteps
              jobId={`replay-${speed}`}
              loadJob={async () => simulatedJob(replay.now())}
              onFinished={fn()}
              onStop={async () => undefined}
            />
          </div>
        </section>
      ) : (
        reader
      )}
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

/** On the rulebook page while it builds: the reader above the build's progress, both following the same build. */
export const OnTheRulebookPage: Story = {
  parameters: { width: "max-w-3xl" },
  render: () => <Replay speed={4} withProgress />
}

export const OnTheRulebookPageOnAPhone: Story = {
  parameters: { width: "max-w-[375px]" },
  render: () => <Replay speed={4} withProgress />
}

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

/** One state of the page's status, named. */
function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <section className="flex flex-col gap-4 rounded-lg border p-5">{children}</section>
    </div>
  )
}

const steps = (jobId: string, loadJob: () => Promise<Job | null>) => (
  <div className="text-sm text-muted-foreground">
    <DocumentEncodingSteps jobId={jobId} loadJob={loadJob} onFinished={fn()} onStop={async () => undefined} />
  </div>
)

/** Processing from start to end, side by side: starting, partway, and done with parts skipped as the review says. */
export const EveryState: Story = {
  parameters: { width: "max-w-3xl" },
  render: () => (
    <div className="flex flex-col gap-8">
      <State label="Starting">{steps("every-state-starting", () => new Promise<Job | null>(() => undefined))}</State>
      <State label="Partway">
        <DocumentEncodingReader results={readingResults(600)} documents={readingDocuments(600)} isRunning />
        {steps("every-state-partway", async () => simulatedJob(600))}
      </State>
      <State label="Done, with parts skipped">
        <SkippedNotice parts={skipped} onRetry={fn()} />
      </State>
    </div>
  )
}

export const ReplayedOnAPhone: Story = {
  parameters: { width: "max-w-[343px]" },
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
