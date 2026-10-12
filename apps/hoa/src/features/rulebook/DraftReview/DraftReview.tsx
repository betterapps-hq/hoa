import { ArrowLeftIcon } from "lucide-react"
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
import { CitationsOpenInSheet } from "@/features/documents/ReaderSheet/ReaderSheet"
import type { JobFailure } from "@/jobs/job"
import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf } from "@/rulebook/coverage"
import { attempt } from "../attempt"
import type { DraftChanges } from "../ChangesTab/ChangesTab"
import { changeSummary } from "../RulebookPage/RulebookPage.utils"
import { countOf } from "../rulebookRecords"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import type { WorkspaceView } from "../RulebookWorkspace/RulebookWorkspace.utils"
import { SkippedNotice } from "../SkippedNotice/SkippedNotice"
import type { RulebookActions, RulebookSource } from "../useRulebookWorkspace"
import { draftTodos, skippedParts, type DraftTodo } from "./DraftReview.utils"

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
  onBack: (() => void) | null
  onPublish: () => Promise<void>
  onDiscard: () => Promise<void>
  /** Processes the documents again, redoing only what was skipped. */
  onRetry: () => Promise<void>
}

/**
 * Reviewing a draft (encoding.md, UX, Draft review): a focused mode with what's next in one sentence and one action,
 * the short to-do list that leads to each item, then what the draft changes. Publish is the action once nothing
 * blocks it; discarding is a clear secondary action that says what's lost.
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
  const todos = draftTodos(records, coverageOf(records))
  const skipped = skippedParts(buildFailures, records)
  const [view, setView] = useState<WorkspaceView>({
    tab: changes ? "changes" : (todos[0]?.view.tab ?? "rules"),
    filter: changes ? null : (todos[0]?.view.filter ?? null),
    request: 0
  })
  const [isBusy, setIsBusy] = useState(false)
  const go = (todo: DraftTodo) => {
    setView({ ...todo.view, request: view.request + 1 })
    document.getElementById("draft-records")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const run = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    await attempt(action, fallback)
    setIsBusy(false)
  }
  const [next, ...rest] = todos
  const decided =
    [...records.rules, ...records.terms].filter((record) => record.review.status !== "proposed").length +
    records.questions.filter((question) => question.answer !== null).length
  const summary = changes ? changeSummary(changes.summary) : null
  const headline = (() => {
    if (!changes) {
      return "Nothing is published yet, so the whole draft needs your review."
    }
    return summary
      ? `Compared with version ${publishedVersion ?? ""}, the draft ${summary}.`
      : "The draft has the same rules as the rulebook in force."
  })()

  return (
    // Reviewing is work in progress: a citation opens its document over the page, not in place of it.
    <CitationsOpenInSheet>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          {onBack ? (
            <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
              <ArrowLeftIcon />
              Rules in force{publishedVersion ? ` (version ${publishedVersion})` : ""}
            </Button>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{changes ? "Review the new draft" : "Review the rulebook"}</h2>
              <p className="text-muted-foreground">{headline}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" disabled={isBusy} />}>
                Discard draft
              </AlertDialogTrigger>
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
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void run(onDiscard, "The draft wasn't discarded.")}
                  >
                    Discard draft
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        <section aria-labelledby="draft-next" className="flex flex-col gap-4 rounded-lg border p-5">
          {next ? (
            <>
              <p id="draft-next" className="text-lg leading-snug">
                {next.sentence} before you can publish.
              </p>
              <Button className="w-fit" onClick={() => go(next)}>
                {next.action}
              </Button>
              {rest.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground">Then:</p>
                  <ul className="flex flex-col gap-0.5">
                    {rest.map((todo) => (
                      <li key={todo.id}>
                        <Button variant="link" className="h-auto p-0 text-link" onClick={() => go(todo)}>
                          {todo.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {!next && blockers.length > 0 ? (
            <>
              <p id="draft-next" className="text-lg leading-snug">
                Everything is reviewed, but the draft can&rsquo;t be published yet.
              </p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </>
          ) : null}
          {!next && blockers.length === 0 ? (
            <>
              <p id="draft-next" className="text-lg leading-snug">
                Everything is reviewed. Publishing makes this the rulebook applications are checked against.
              </p>
              <AlertDialog>
                <AlertDialogTrigger render={<Button className="w-fit" disabled={isBusy} />}>Publish</AlertDialogTrigger>
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
                    <AlertDialogAction onClick={() => void run(onPublish, "Publishing failed.")}>
                      Publish
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </section>

        <section id="draft-records" aria-label="The draft" className="scroll-mt-4">
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
    </CitationsOpenInSheet>
  )
}
