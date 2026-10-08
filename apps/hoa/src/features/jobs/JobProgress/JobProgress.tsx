import { useQuery } from "@tanstack/react-query"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import type { Job } from "@/jobs/job"
import { stageLabel } from "./JobProgress.utils"

export type JobProgressProps = {
  jobId: string
  loadJob: (jobId: string) => Promise<Job | null>
  /** Called once when the job ends, so the page can reload its data. */
  onFinished?: (job: Job) => void
}

/** Shows a background job's stage and progress, polling every 2 seconds until it ends. */
export function JobProgress({ jobId, loadJob, onFinished }: JobProgressProps) {
  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const loaded = await loadJob(jobId)
      if (loaded && loaded.status !== "running") {
        onFinished?.(loaded)
      }
      return loaded
    },
    refetchInterval: (query) => (query.state.data?.status === "running" || !query.state.data ? 2000 : false)
  })

  if (!job || job.status === "running") {
    const percent = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : null
    return (
      <output className="flex min-w-48 flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>
            {stageLabel(job?.stage ?? null)}
            {job && job.total > 0 ? `: ${job.done} of ${job.total}` : ""}
          </span>
        </div>
        {percent === null ? null : <Progress value={percent} aria-label="Progress" />}
      </output>
    )
  }
  if (job.status === "failed") {
    return <p className="text-sm text-destructive">{job.error?.message ?? "This failed."}</p>
  }
  return (
    <p className="text-sm text-muted-foreground">
      {job.status === "completed-with-errors"
        ? `Done, with ${job.failures.length} ${job.failures.length === 1 ? "problem" : "problems"}`
        : "Done"}
    </p>
  )
}
