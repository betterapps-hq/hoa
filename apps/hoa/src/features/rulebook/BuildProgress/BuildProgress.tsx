import { useQuery } from "@tanstack/react-query"
import { CheckIcon, ChevronDownIcon, CircleIcon, MinusIcon } from "lucide-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { cn } from "@/lib/utils"
import {
  buildSteps,
  elapsedText,
  estimateBuild,
  summaryText,
  timeLeftText,
  type BuildStep
} from "./BuildProgress.utils"

export type BuildProgressProps = {
  jobId: string
  loadJob: (jobId: string) => Promise<Job | null>
  /** Called once when the build ends, so the page can reload. */
  onFinished: (job: Job) => void
  /** Stops the build; resolves once it's stopped or found already over. */
  onStop: () => Promise<void>
  /** The time, in milliseconds; tests fix it. */
  now?: () => number
}

/**
 * A running build's progress (encoding.md, UX, The build's progress): one line with the current step and the time left,
 * one bar for the whole build that's never full before it ends, every step in plain words behind a disclosure, and a
 * quiet way to stop it. Polls the job every 2 seconds.
 */
export function BuildProgress({ jobId, loadJob, onFinished, onStop, now = Date.now }: BuildProgressProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const loaded = await loadJob(jobId)
      if (loaded && loaded.status !== "running") {
        onFinished(loaded)
      }
      return loaded
    },
    refetchInterval: (query) => (query.state.data?.status === "running" || !query.state.data ? 2000 : false)
  })

  if (job && !job.progress) {
    return <JobProgress jobId={jobId} loadJob={loadJob} onFinished={onFinished} />
  }
  const steps = job?.progress ? buildSteps(job.progress) : []
  const estimate = job ? estimateBuild(job, now()) : null
  const isRunning = !job || job.status === "running"

  return (
    <div className="flex flex-col gap-3">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <output className="flex items-center gap-2 text-sm">
            {isRunning ? <Spinner aria-hidden /> : null}
            <span>{job ? summaryText(steps, estimate?.remaining ?? null) : "Starting"}</span>
          </output>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group/steps -my-1 shrink-0" />}>
            {isOpen ? "Hide steps" : "Show steps"}
            <ChevronDownIcon aria-hidden className="transition-transform group-aria-expanded/steps:rotate-180" />
          </CollapsibleTrigger>
        </div>
        <Progress value={Math.round((estimate?.fraction ?? 0) * 100)} aria-label="Build progress" />
        {estimate ? (
          <p className="text-sm text-muted-foreground">
            {timeLeftText(estimate.remaining)}. {elapsedText(estimate.elapsed)}.
          </p>
        ) : null}
        <CollapsibleContent>
          <ol aria-label="Build steps" className="flex flex-col gap-2">
            {steps.map((step) => (
              <StepRow key={step.label} step={step} />
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
      {isRunning ? <StopBuild onStop={onStop} /> : null}
    </div>
  )
}

const statusWords: Record<BuildStep["status"], string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Not started",
  skipped: "Skipped"
}

function StepRow({ step }: { step: BuildStep }) {
  const optionalWords: Partial<Record<BuildStep["status"], string>> = { skipped: "Not needed", upcoming: "If needed" }
  const detail = (step.isOptional ? optionalWords[step.status] : undefined) ?? step.count
  return (
    <li
      aria-current={step.status === "current" ? "step" : undefined}
      className={cn(
        "flex items-start gap-2.5 text-sm",
        step.status === "upcoming" || step.status === "skipped" ? "text-muted-foreground" : ""
      )}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        <StepIcon status={step.status} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={step.status === "current" ? "font-medium" : ""}>
          {step.label}
          <span className="sr-only">: {statusWords[step.status]}</span>
        </span>
        {detail ? <span className="text-muted-foreground">{detail}</span> : null}
      </span>
    </li>
  )
}

function StepIcon({ status }: { status: BuildStep["status"] }) {
  switch (status) {
    case "done":
      return <CheckIcon aria-hidden className="size-4 text-primary" />
    case "current":
      return <Spinner aria-hidden className="size-4" />
    case "skipped":
      return <MinusIcon aria-hidden className="size-4" />
    case "upcoming":
      return <CircleIcon aria-hidden className="size-3" />
  }
}

function StopBuild({ onStop }: { onStop: () => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const stop = async () => {
    setIsStopping(true)
    await onStop()
    setIsStopping(false)
    setIsOpen(false)
  }
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" className="w-fit" disabled={isStopping} />}>
        {isStopping ? "Stopping" : "Stop building"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop this build?</AlertDialogTitle>
          <AlertDialogDescription>
            Work finished so far is kept and reused next time. Nothing is published.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep building</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isStopping} onClick={() => void stop()}>
            Stop building
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
