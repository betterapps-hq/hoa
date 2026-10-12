import { DownloadIcon, UploadIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
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
import type { GoverningDocument } from "@/documents/governingDocument"
import {
  GoverningDocuments,
  useUploadDialog,
  type UploadDialog
} from "@/features/documents/GoverningDocuments/GoverningDocuments"
import type { DocumentDetails } from "@/features/documents/uploadDocument"
import type { Job } from "@/jobs/job"
import type { RefusedDocument } from "@/rulebook/buildSources"
import type { StopResult } from "@/workflows/rulebookTrigger.server"
import { attempt } from "../attempt"
import { DocumentEncodingSteps } from "../DocumentEncodingSteps/DocumentEncodingSteps"
import { DraftReview } from "../DraftReview/DraftReview"
import { saveFile } from "../PublishedRulebook/PublishedRulebook.utils"
import type { RulebookSources, RulebookView } from "../rulebook.functions"
import { recordsOf } from "../rulebookRecords"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import type { RulebookActions, RulebookSource } from "../useRulebookWorkspace"
import { refusalSentence, rulebookStatus, type RulebookStatus } from "./RulebookPage.utils"

export type RulebookPageProps = {
  draft: RulebookView
  published: RulebookView
  sources: RulebookSources
  /** Every upload, each version of each document. */
  uploads: GoverningDocument[]
  /** The ingest job of each document being read, by document id. */
  jobs: Record<string, string>
  /** Loads document pages for citations and coverage. */
  source: RulebookSource
  /** What the administrator can do to the draft. */
  actions: RulebookActions
  /** Shows the draft for review instead of the rulebook in force. */
  isReviewing: boolean
  onReviewingChange: (isReviewing: boolean) => void
  loadJob: (jobId: string) => Promise<Job | null>
  loadRulesFile: () => Promise<string>
  onUpload: (file: File, details: DocumentDetails) => Promise<unknown>
  /** Removes a governing document, every version of it, from the documents builds read. */
  onRemoveDocument: (documentId: string) => Promise<void>
  /** Builds a draft from the current documents, when one didn't start on its own or failed. */
  onBuild: () => Promise<void>
  /** Stops the running build. */
  onStop: () => Promise<StopResult>
  onPublish: (rulebookId: string) => Promise<void>
  onDiscard: (rulebookId: string) => Promise<void>
  onChanged: () => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/**
 * The administrator's rulebook and governing documents in one place (encoding.md, UX): the rulebook in force, the
 * documents it's built from, and one quiet line about what's happening or next. Uploading a document rebuilds the
 * draft; reviewing the draft is a focused mode that ends in publishing or discarding it.
 */
export function RulebookPage(props: RulebookPageProps) {
  const { draft, published, sources, source, actions, isReviewing, onReviewingChange } = props
  const draftRecords =
    draft.rulebook && draft.content ? recordsOf(sources, draft.rulebook, draft.content, "draft") : null
  const draftId = draft.rulebook?.id

  if (isReviewing && draftRecords && draftId) {
    const publishedRecords =
      published.rulebook && published.content
        ? recordsOf(sources, published.rulebook, published.content, "published", published.filedSources)
        : null
    return (
      <DraftReview
        records={draftRecords}
        changes={
          draft.changes && !draft.changes.isFirst && publishedRecords
            ? { summary: draft.changes, published: publishedRecords }
            : null
        }
        blockers={draft.blockers}
        buildFailures={draft.buildFailures}
        publishedVersion={published.rulebook?.version ?? null}
        isRebuilding={draft.isBuilding}
        source={source}
        actions={actions}
        onBack={published.rulebook ? () => onReviewingChange(false) : null}
        onPublish={async () => {
          await props.onPublish(draftId)
          onReviewingChange(false)
        }}
        onDiscard={async () => {
          await props.onDiscard(draftId)
          onReviewingChange(false)
        }}
        onRetry={async () => {
          await props.onBuild()
          props.onChanged()
        }}
      />
    )
  }

  return <RulebookOverview {...props} />
}

/** The rulebook page outside review: the status line, the documents and the rules in force. */
function RulebookOverview(props: RulebookPageProps) {
  const { draft, published, sources, uploads, source } = props
  // The status line opens the documents' upload dialog too, when a document has to be uploaded again.
  const uploadDialog = useUploadDialog()
  const status = rulebookStatus({ draft, published, uploads })
  return (
    <div className="flex flex-col gap-10">
      <StatusLine status={status} uploadDialog={uploadDialog} {...props} />
      <GoverningDocuments
        uploadDialog={uploadDialog}
        uploads={uploads}
        jobs={props.jobs}
        loadJob={props.loadJob}
        onUpload={props.onUpload}
        onChanged={props.onChanged}
      />
      <RulesInForce published={published} sources={sources} source={source} loadRulesFile={props.loadRulesFile} />
    </div>
  )
}

function StatusLine({
  status,
  uploadDialog,
  ...props
}: { status: RulebookStatus; uploadDialog: UploadDialog } & RulebookPageProps) {
  const [isBusy, setIsBusy] = useState(false)
  const build = async () => {
    setIsBusy(true)
    await attempt(props.onBuild, "Processing didn't start.")
    setIsBusy(false)
    props.onChanged()
  }
  const stop = async () => {
    const result = await attempt(props.onStop, "Processing couldn’t be stopped.")
    if (result && result.status !== "stopped") {
      toast("Processing had already finished, so there was nothing to stop.")
    }
    props.onChanged()
  }
  const line = (sentence: ReactNode, detail: ReactNode, action: ReactNode = null) => (
    <section aria-label="Status" className="flex flex-col gap-3 rounded-lg border p-5">
      <p className="text-lg leading-snug">{sentence}</p>
      {detail ? <div className="text-sm text-muted-foreground">{detail}</div> : null}
      {action}
    </section>
  )
  const reading = (titles: string[]) => (titles.length === 1 ? titles[0] : `${titles.length} documents`)
  switch (status.kind) {
    case "building":
      return line(
        "Updating the rulebook from your documents.",
        <div className="flex flex-col gap-4">
          <p>
            You can leave this page. When it&rsquo;s done, you review what changed here before it&rsquo;s published.
          </p>
          {props.draft.buildJobId ? (
            <DocumentEncodingSteps
              jobId={props.draft.buildJobId}
              loadJob={props.loadJob}
              onFinished={props.onChanged}
              onStop={stop}
            />
          ) : null}
        </div>
      )
    case "reading":
      return line(
        `Reading ${reading(status.reading)}.`,
        "The rulebook updates once it’s read. You review what changed before it’s published."
      )
    case "draft-ready":
      return line(
        status.isFirst ? "Your rulebook is ready to review." : "A new draft of the rulebook is ready to review.",
        [
          ...(status.isFirst
            ? ["Nothing is published yet. Review the draft and publish it to start checking applications against it."]
            : [
                status.builtFrom.length > 0 ? `It was made after ${status.builtFrom.join(", ")} changed.` : null,
                status.summary ? `It ${status.summary}.` : "It has the same rules as the rulebook in force."
              ]),
          status.skipped > 0 ? "Some parts weren’t finished. They’re listed in the review." : null
        ]
          .filter((part) => part !== null)
          .join(" "),
        <Button className="w-fit" onClick={() => props.onReviewingChange(true)}>
          {status.isFirst ? "Review the draft" : "Review changes"}
        </Button>
      )
    case "build-stopped":
      return line(
        "Processing was stopped.",
        status.hasDraft
          ? "Work it finished is kept and reused next time. The earlier draft is still here to review."
          : "Work it finished is kept and reused next time. Nothing was published.",
        <div className="flex flex-wrap gap-2">
          <Button className="w-fit" disabled={isBusy} onClick={() => void build()}>
            Process documents
          </Button>
          {status.hasDraft ? (
            <Button variant="ghost" className="w-fit" onClick={() => props.onReviewingChange(true)}>
              Review the earlier draft
            </Button>
          ) : null}
        </div>
      )
    case "build-refused":
      return line(
        status.documents.length === 1
          ? "The rulebook can’t be updated until one of your documents is fixed."
          : "The rulebook can’t be updated until some of your documents are fixed.",
        <ul className="flex flex-col gap-3">
          {status.documents.map((document) => (
            <li key={document.documentId} className="flex flex-col items-start gap-1.5">
              <p>{refusalSentence(document)}</p>
              <RemoveDocument document={document} onRemove={props.onRemoveDocument} onRemoved={props.onChanged} />
            </li>
          ))}
        </ul>,
        <Button className="w-fit" onClick={() => uploadDialog.open()}>
          <UploadIcon />
          Upload
        </Button>
      )
    case "build-failed":
      return line(
        "The last update of the rulebook didn’t finish.",
        <p className="line-clamp-3 break-words">{status.error}</p>,
        status.isRetryable ? (
          <Button className="w-fit" disabled={isBusy} onClick={() => void build()}>
            Try again
          </Button>
        ) : null
      )
    case "documents-changed":
      return line(
        `Your documents changed since version ${status.version ?? ""} was published.`,
        "Process them to see what changes.",
        <Button className="w-fit" disabled={isBusy} onClick={() => void build()}>
          Process documents
        </Button>
      )
    case "not-built":
      return line(
        "Turn your documents into a rulebook.",
        "Each provision is read and encoded as rules for you to review and publish.",
        <Button className="w-fit" disabled={isBusy} onClick={() => void build()}>
          Process documents
        </Button>
      )
    case "none":
      return null
  }
}

/** Removes a document the build refused, after a confirmation that names it. */
function RemoveDocument({
  document,
  onRemove,
  onRemoved
}: {
  document: RefusedDocument
  onRemove: (documentId: string) => Promise<void>
  onRemoved: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const remove = async () => {
    setIsRemoving(true)
    const result = await attempt(async () => {
      await onRemove(document.documentId)
      return true
    }, "The document wasn’t removed.")
    setIsRemoving(false)
    setIsOpen(false)
    if (result) {
      toast.success(`“${document.title}” was removed.`)
      onRemoved()
    }
  }
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={isRemoving}
            aria-label={`Remove document “${document.title}”`}
          />
        }
      >
        Remove document
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{document.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It&rsquo;s taken off your governing documents, with any earlier versions, so the rulebook is no longer built
            from it. The rulebook in force doesn&rsquo;t change until you publish a new one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isRemoving} onClick={() => void remove()}>
            Remove document
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RulesInForce({
  published,
  sources,
  source,
  loadRulesFile
}: Pick<RulebookPageProps, "published" | "sources" | "source" | "loadRulesFile">) {
  const [isDownloading, setIsDownloading] = useState(false)
  const { rulebook, content } = published
  if (!rulebook || !content) {
    return null
  }
  const records = recordsOf(sources, rulebook, content, "published", published.filedSources)
  const download = async () => {
    setIsDownloading(true)
    const json = await attempt(loadRulesFile, "The rules file couldn't be downloaded.")
    setIsDownloading(false)
    if (json) {
      saveFile(`rules-version-${rulebook.version ?? "draft"}.json`, json)
    }
  }
  return (
    <section aria-labelledby="rules-in-force" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="rules-in-force" className="text-base font-semibold">
            Rules in force
          </h2>
          <p className="text-sm text-muted-foreground">
            Version {rulebook.version}
            {rulebook.publishedAt ? `, published ${dateFormat.format(new Date(rulebook.publishedAt))}` : ""}.
            Applications are checked against it.
          </p>
        </div>
        {published.fileSha256 ? (
          <Button size="sm" variant="ghost" disabled={isDownloading} onClick={() => void download()}>
            <DownloadIcon />
            {isDownloading ? "Downloading" : "Rules file"}
          </Button>
        ) : null}
      </div>
      <RulebookWorkspace records={records} source={source} actions={null} audience="administrator" />
    </section>
  )
}
