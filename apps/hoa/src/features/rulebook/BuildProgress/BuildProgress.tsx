import { useInterval } from "@mantine/hooks"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { cn } from "@/lib/utils"
import type { BuildResults } from "@/rulebook/buildResults.server"
import {
  buildSteps,
  elapsedText,
  estimateBuild,
  summaryText,
  timeLeftText,
  type BuildStep
} from "./BuildProgress.utils"
import { useBuildResults } from "./useBuildResults"

export type BuildProgressProps = {
  jobId: string
  loadJob: (jobId: string) => Promise<Job | null>
  /** Called once when the build ends, so the page can reload. */
  onFinished: (job: Job) => void
  /** Stops the build; resolves once it's stopped or found already over. */
  onStop: () => Promise<void>
  /** What the build has produced so far, since a cursor. */
  loadResults: (since: string | null) => Promise<BuildResults>
  /** The time, in milliseconds; tests fix it. */
  now?: () => number
}

/**
 * A running build's progress (encoding.md, UX, The build's progress): one row with the time left (and the current step
 * while the steps are hidden), the time so far and the steps' toggle, one bar for the whole build that's never full
 * before it ends, every step in plain words behind the toggle, and a quiet way to stop it. Polls the job every 2
 * seconds.
 */
export function BuildProgress({ jobId, loadJob, onFinished, onStop, loadResults, now = Date.now }: BuildProgressProps) {
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

  const isRunning = !job || job.status === "running"
  const results = useBuildResults(jobId, loadResults, isRunning)
  // The time so far and the time left move with the clock, not only when the job changes: a step whose calls take
  // minutes would otherwise freeze them.
  const [, setTick] = useState(0)
  useInterval(() => setTick((tick) => tick + 1), 10_000, { autoInvoke: true })

  if (job && !job.progress) {
    return <JobProgress jobId={jobId} loadJob={loadJob} onFinished={onFinished} />
  }
  const steps = job?.progress ? buildSteps(job.progress, results) : []
  const estimate = job ? estimateBuild(job, now()) : null
  // With the steps showing, the line above them gives only the time left: the list already names the current step.
  const remaining = estimate?.remaining ?? null
  const summary = isOpen ? timeLeftText(remaining) : summaryText(steps, remaining)
  const stepsLabel = isOpen ? "Hide steps" : "Show steps"

  return (
    <div className="flex flex-col gap-3">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <output className="flex min-w-0 flex-1 items-start gap-2 text-sm">
            {isRunning ? <Spinner aria-hidden className="mt-0.5 shrink-0" /> : null}
            <span className="text-pretty">{job ? summary : "Starting"}</span>
          </output>
          {estimate ? (
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{elapsedText(estimate.elapsed)}</span>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={stepsLabel}
                      className="group/steps -my-1.5 shrink-0"
                    />
                  }
                />
              }
            >
              <ChevronDownIcon aria-hidden className="transition-transform group-aria-expanded/steps:rotate-180" />
            </TooltipTrigger>
            <TooltipContent>{stepsLabel}</TooltipContent>
          </Tooltip>
        </div>
        <Progress value={Math.round((estimate?.fraction ?? 0) * 100)} aria-label="Build progress" />
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
  const detail = step.isOptional ? optionalWords[step.status] : undefined
  const found = step.status === "upcoming" ? null : step.found
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
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={step.status === "current" ? "font-medium" : ""}>
          {step.label}
          <span className="sr-only">: {statusWords[step.status]}</span>
        </span>
        {detail || found ? (
          <span className="text-muted-foreground">{[detail, found].filter(Boolean).join(", ")}</span>
        ) : null}
        {step.fraction === null ? null : (
          <Progress
            value={Math.round(step.fraction * 100)}
            aria-label={`${step.label} progress`}
            className="h-1 max-w-48"
          />
        )}
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
