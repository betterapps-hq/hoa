import type { Job } from "@/jobs/job"
import type { BuildResultsPage } from "@/rulebook/buildResults"
import type { BuildDocument } from "@/rulebook/buildResults.server"
import { DocumentEncodingReader } from "../DocumentEncodingReader/DocumentEncodingReader"
import { useBuildReading } from "../DocumentEncodingReader/useBuildReading"
import { DocumentEncodingSteps } from "../DocumentEncodingSteps/DocumentEncodingSteps"

export type ProcessingStatusProps = {
  jobId: string
  loadJob: (jobId: string) => Promise<Job | null>
  /** What the build has produced since a cursor. */
  loadResults: (since: string | null) => Promise<BuildResultsPage>
  /** The documents the build reads, with their provisions, once it has structured them. */
  loadDocuments: () => Promise<BuildDocument[]>
  /** Called once when the build ends, so the page can reload. */
  onFinished: (job: Job) => void
  /** Stops the build; resolves once it's stopped or found already over. */
  onStop: () => Promise<void>
}

/**
 * The rulebook page's status while documents are processed (encoding.md, UX, The build's progress): a short title, the
 * reader following what the build finds in the documents, and the build's steps under it.
 */
export function ProcessingStatus({
  jobId,
  loadJob,
  loadResults,
  loadDocuments,
  onFinished,
  onStop
}: ProcessingStatusProps) {
  const { results, documents } = useBuildReading(jobId, loadResults, loadDocuments)
  return (
    <section aria-label="Status" className="flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex flex-col gap-0.5 pb-3">
        <p className="font-medium">Processing your documents</p>
        <p className="text-sm text-muted-foreground">You can leave this page and come back.</p>
      </div>
      <div className="pb-2">
        <DocumentEncodingReader results={results} documents={documents} isRunning />
      </div>
      <div className="text-sm text-muted-foreground">
        <DocumentEncodingSteps jobId={jobId} loadJob={loadJob} onFinished={onFinished} onStop={onStop} />
      </div>
    </section>
  )
}
