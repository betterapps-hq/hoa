import { ArrowLeftIcon, CheckCheckIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { PageActions } from "@/components/PageActions/PageActions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { CitationsOpenInSheet } from "@/features/documents/ReaderSheet/ReaderSheet"
import type { JobFailure } from "@/jobs/job"
import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf } from "@/rulebook/coverage"
import { attempt } from "../attempt"
import type { DraftChanges } from "../ChangesTab/ChangesTab"
import { changeSummary } from "../RulebookPage/RulebookPage.utils"
import { countOf } from "../rulebookRecords"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import { tabWork, workspaceTabs, type WorkspaceView } from "../RulebookWorkspace/RulebookWorkspace.utils"
import { SkippedNotice } from "../SkippedNotice/SkippedNotice"
import type { RulebookActions, RulebookSource } from "../useRulebookWorkspace"
import { approvableRefs, draftProgress, skippedParts } from "./DraftReview.utils"

export type DraftReviewProps = {
  records: RulebookRecords
  /** What it changes from the published rulebook; null when nothing is published, so the draft is the whole rulebook. */
  changes: DraftChanges | null
  /** Why it can't be published yet, as the server checks it. */
  blockers: string[]
  /** What the build that made the draft skipped. */
  buildFailures: JobFailure[]
  /** The version in force, for the way back; null when nothing is published. */
  publishedVersion: number | null
  /** A newer build is running: the draft will be replaced, keeping the decisions on unchanged records. */
  isRebuilding: boolean
  source: RulebookSource
  actions: RulebookActions
  /** Back to the rulebook page. */
  onBack: () => void
  onPublish: () => Promise<void>
  onDiscard: () => Promise<void>
  /** Processes the documents again, redoing only what was skipped. */
  onRetry: () => Promise<void>
}

const numberFormat = new Intl.NumberFormat("en-US")

type Confirming = "publish" | "approve" | "discard"

/**
 * Reviewing a draft (encoding.md, UX, Draft review): how much is decided, in a sentence and a bar, then the draft's
 * tabs, each saying how much it has left, so they're the to-do list. The page's actions (ux.md, Page actions) are
 * Publish, once nothing blocks it, and in its menu approving everything left and discarding the draft, each after a
 * confirmation that says what it does.
 */
export function DraftReview({
  records,
  changes,
  blockers,
  buildFailures,
  publishedVersion,
  isRebuilding,
  source,
  actions,
  onBack,
  onPublish,
  onDiscard,
  onRetry
}: DraftReviewProps) {
  const work = tabWork(records, coverageOf(records))
  const tabs = workspaceTabs(records, { audience: "administrator", hasChanges: changes !== null })
  const skipped = skippedParts(buildFailures, records)
  // A changed rulebook opens on what changed; a first one on the first tab with something left in it.
  const [view, setView] = useState<WorkspaceView>(() => ({
    tab: changes ? "changes" : (tabs.find((tab) => work[tab] > 0) ?? tabs[0] ?? "rules"),
    filter: null,
    request: 0
  }))
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const run = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    await attempt(action, fallback)
    setIsBusy(false)
  }
  const { decided, total } = draftProgress(records)
  const left = approvableRefs(records)
  const isDone = decided === total && Object.values(work).every((count) => count === 0)
  const summary = changes ? changeSummary(changes.summary) : null
  const headline = (() => {
    if (!changes) {
      return "Nothing is published yet, so the whole draft needs your review."
    }
    return summary
      ? `Compared with version ${publishedVersion ?? ""}, the draft ${summary}.`
      : "The draft has the same rules as the rulebook in force."
  })()

  const approveEverything = async () => {
    setIsBusy(true)
    const result = await attempt(() => actions.review(left.all, "approved", null), "Nothing was approved.")
    setIsBusy(false)
    if (result) {
      const [first] = result.skipped
      toast.success(
        first
          ? `Approved ${numberFormat.format(result.updated)}. ${numberFormat.format(result.skipped.length)} still need you, such as one where: ${first.reasons[0] ?? ""}`
          : `Approved ${numberFormat.format(result.updated)}.`
      )
    }
  }
  const leftWords = [
    left.rules.length > 0 ? countOf(left.rules.length, "rule", "rules") : null,
    left.terms.length > 0 ? countOf(left.terms.length, "term", "terms") : null,
    left.settings.length > 0 ? "the settings" : null,
    left.reasons.length > 0
      ? countOf(left.reasons.length, "reason for having no rule", "reasons for having no rule")
      : null
  ].filter((words) => words !== null)

  return (
    // Reviewing is work in progress: a citation opens its document over the page, not in place of it.
    <CitationsOpenInSheet>
      <PageActions
        primary={{
          label: "Publish",
          disabled: isBusy || isRebuilding || blockers.length > 0,
          onSelect: () => setConfirming("publish")
        }}
        more={[
          {
            label: "Approve everything left",
            icon: CheckCheckIcon,
            disabled: isBusy || left.all.length === 0,
            onSelect: () => setConfirming("approve")
          },
          {
            label: "Discard draft",
            icon: Trash2Icon,
            isDestructive: true,
            disabled: isBusy,
            onSelect: () => setConfirming("discard")
          }
        ]}
      />
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
            <ArrowLeftIcon />
            {publishedVersion ? `Rules in force (version ${publishedVersion})` : "Rulebook"}
          </Button>
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-lg leading-snug">{headline}</p>
            <Progress value={total === 0 ? 100 : (decided / total) * 100} className="max-w-md">
              <ProgressLabel className="sr-only">Decided</ProgressLabel>
            </Progress>
            {isDone && blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Everything is decided. Publish makes this the rulebook applications are checked against.
              </p>
            ) : null}
            {isDone && blockers.length > 0 ? (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>Everything is decided, but the draft can&rsquo;t be published yet:</p>
                <ul className="flex flex-col gap-0.5">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isDone ? null : (
              <p className="text-sm text-muted-foreground">
                {numberFormat.format(decided)} of {numberFormat.format(total)} decided. The number on each tab is what
                it has left; Publish opens once nothing is.
              </p>
            )}
          </div>
          {isRebuilding ? (
            <p className="text-sm text-muted-foreground">
              Your latest documents are being processed into a newer draft. It replaces this one and keeps your
              decisions on everything that didn&rsquo;t change.
            </p>
          ) : null}
          {skipped.length > 0 ? (
            <SkippedNotice
              parts={skipped}
              isBusy={isBusy}
              onRetry={isRebuilding ? null : () => void run(onRetry, "Processing didn’t start.")}
            />
          ) : null}
        </header>

        <section aria-label="The draft">
          <RulebookWorkspace
            records={records}
            source={source}
            actions={actions}
            audience="administrator"
            changes={changes}
            view={view}
            onViewChange={setView}
          />
        </section>
      </div>

      <AlertDialog open={confirming === "publish"} onOpenChange={(isOpen) => setConfirming(isOpen ? "publish" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this rulebook?</AlertDialogTitle>
            <AlertDialogDescription>
              {publishedVersion
                ? `It replaces version ${publishedVersion}. New reviews of applications use it; past reviews keep the version they used.`
                : "Reviews of applications use it from now on."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run(onPublish, "Publishing failed.")}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming === "approve"} onOpenChange={(isOpen) => setConfirming(isOpen ? "approve" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve everything left to review?</AlertDialogTitle>
            <AlertDialogDescription>
              This approves {listWords(leftWords)} without opening them. Anything with a problem to fix, or that&rsquo;s
              a reading of an open question, stays to review, and you&rsquo;ll see why. Questions still need your
              answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void approveEverything()}>Approve them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming === "discard"} onOpenChange={(isOpen) => setConfirming(isOpen ? "discard" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {decided > 0
                ? `The ${countOf(decided, "review decision", "review decisions")} made on it (approvals, rejections, answers and edits) are lost.`
                : "Nothing has been reviewed on it yet."}{" "}
              {publishedVersion
                ? `Version ${publishedVersion} stays in force.`
                : "Nothing is published, so there will be no rulebook until you process your documents again."}{" "}
              Uploading a document starts a new draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run(onDiscard, "The draft wasn't discarded.")}>
              Discard draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CitationsOpenInSheet>
  )
}

/** "1 rule, 3 terms, and the settings" */
function listWords(words: string[]) {
  return new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(words)
}
