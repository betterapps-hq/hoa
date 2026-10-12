import { ChevronDownIcon, FileTextIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { GoverningDocument } from "@/documents/governingDocument"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { citationHref } from "../citationLink"
import { DocumentDownload } from "../DocumentDownload/DocumentDownload"
import { documentKindLabels, documentVersions } from "../documentKinds"
import { ReaderLink } from "../ReaderLink/ReaderLink"
import type { DocumentDetails } from "../uploadDocument"
import { UploadDocumentDialog } from "../UploadDocumentDialog/UploadDocumentDialog"

export type GoverningDocumentsProps = {
  uploads: GoverningDocument[]
  /** The running job for each document being read, by document id. */
  jobs: Record<string, string>
  loadJob: (jobId: string) => Promise<Job | null>
  /** With this, an administrator can upload documents and new versions of them. */
  onUpload?: (file: File, details: DocumentDetails) => Promise<unknown>
  onChanged: () => void
  /** How many documents show before "Show all". */
  initialCount?: number
  /** The upload dialog, when something else on the page opens it too. */
  uploadDialog?: UploadDialog
}

export type UploadDialog = ReturnType<typeof useUploadDialog>

/** The upload dialog's state, with a new key for each opening so it starts empty. */
export function useUploadDialog() {
  const [state, setState] = useState({ isOpen: false, key: 0 })
  return {
    ...state,
    open: () => setState(({ key }) => ({ isOpen: true, key: key + 1 })),
    setIsOpen: (isOpen: boolean) => setState((current) => ({ ...current, isOpen }))
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** "Oct 9, 2026", or null for a date that isn't one. */
function dateText(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date)
}

/**
 * The organization's governing documents (encoding.md, UX, Documents): each document's current version with its
 * earlier ones behind a disclosure, each one opened or downloaded as uploaded. Administrators upload documents and new
 * versions of them through one Upload, which asks which it is; the rulebook is rebuilt from them once they're read.
 */
export function GoverningDocuments({
  uploads,
  jobs,
  loadJob,
  onUpload,
  onChanged,
  initialCount = 6,
  uploadDialog
}: GoverningDocumentsProps) {
  const ownUpload = useUploadDialog()
  const upload = uploadDialog ?? ownUpload
  const [isAllShown, setIsAllShown] = useState(false)
  const documents = documentVersions(uploads)
  const shown = isAllShown ? documents : documents.slice(0, initialCount)

  return (
    <section aria-labelledby="governing-documents" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="governing-documents" className="text-base font-semibold">
          Governing documents
        </h2>
        {onUpload && documents.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => upload.open()}>
            <UploadIcon />
            Upload
          </Button>
        ) : null}
      </div>
      {documents.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              {onUpload
                ? "Upload the CC&Rs, design guidelines and other governing documents. The rulebook is made from them."
                : "The association hasn’t added its governing documents yet."}
            </EmptyDescription>
          </EmptyHeader>
          {onUpload ? (
            <EmptyContent>
              <Button onClick={() => upload.open()}>
                <UploadIcon />
                Upload a document
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ul className="@container flex flex-col gap-2">
          {shown.map(({ latest, earlier }) => (
            <li key={latest.lineageId} className="flex flex-col gap-1">
              <DocumentRow
                document={latest}
                jobId={jobs[latest.id]}
                loadJob={loadJob}
                onChanged={onChanged}
                isReadable={latest.status === "ready" && Boolean(latest.pageCount)}
              />
              {earlier.length > 0 ? <EarlierVersions versions={earlier} /> : null}
            </li>
          ))}
        </ul>
      )}
      {documents.length > shown.length ? (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setIsAllShown(true)}>
          Show all {documents.length} documents
        </Button>
      ) : null}
      {onUpload ? (
        <UploadDocumentDialog
          key={upload.key}
          isOpen={upload.isOpen}
          onOpenChange={upload.setIsOpen}
          documents={documents.map(({ latest }) => latest)}
          onUpload={onUpload}
          onUploaded={onChanged}
        />
      ) : null}
    </section>
  )
}

function DocumentRow({
  document,
  jobId,
  loadJob,
  onChanged,
  isReadable
}: {
  document: GoverningDocument
  jobId: string | undefined
  loadJob: GoverningDocumentsProps["loadJob"]
  onChanged: () => void
  /** Whether its pages were read, so it opens in the document reader. */
  isReadable: boolean
}) {
  // An upload that didn't finish has no file to save.
  const isDownloadable = document.status !== "uploading"
  const details = [
    documentKindLabels[document.kind],
    document.version > 1 ? `version ${document.version}` : null,
    document.pageCount ? `${document.pageCount} pages` : null,
    dateText(document.uploadedAt) ? `added ${dateText(document.uploadedAt)}` : null
  ].filter((item) => item !== null)
  return (
    <Attachment className="w-full" state={documentState(document.status)}>
      <AttachmentMedia>
        <FileTextIcon aria-hidden />
      </AttachmentMedia>
      <AttachmentContent className="flex flex-col gap-0.5">
        <AttachmentTitle title={document.title}>{document.title}</AttachmentTitle>
        <AttachmentDescription>{details.join(", ")}</AttachmentDescription>
        {document.status === "processing" && jobId ? (
          <JobProgress jobId={jobId} loadJob={loadJob} onFinished={onChanged} />
        ) : null}
        {document.status === "processing" && !jobId ? (
          <span className="text-xs text-muted-foreground">Being read</span>
        ) : null}
        {document.status === "uploading" ? (
          <span className="text-xs text-muted-foreground">The upload didn&rsquo;t finish.</span>
        ) : null}
        {document.status === "failed" ? (
          <span className="text-xs text-destructive">
            It couldn&rsquo;t be read{document.error ? `: ${document.error.message}` : "."}
          </span>
        ) : null}
      </AttachmentContent>
      {/* The whole card opens the document in the reader once its pages were read. */}
      {isReadable ? (
        <AttachmentTrigger
          render={<ReaderLink href={citationHref(document.id)} />}
          aria-label={`Read ${document.title}`}
        />
      ) : null}
      {isDownloadable ? (
        <AttachmentActions>
          <DocumentDownload documentId={document.id} title={document.title} />
        </AttachmentActions>
      ) : null}
    </Attachment>
  )
}

/** A document's state as an attachment shows it: read, being read, an upload that didn't finish, or not readable. */
function documentState(status: GoverningDocument["status"]) {
  if (status === "failed") {
    return "error"
  }
  if (status === "uploading") {
    return "idle"
  }
  return status === "processing" ? "processing" : "done"
}

function EarlierVersions({ versions }: { versions: GoverningDocument[] }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="xs"
        variant="ghost"
        className="-ml-2 w-fit text-muted-foreground"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ChevronDownIcon className={isOpen ? "rotate-180" : undefined} />
        {versions.length === 1 ? "1 earlier version" : `${versions.length} earlier versions`}
      </Button>
      {isOpen ? (
        <ul className="flex flex-col gap-1 border-l pl-3">
          {versions.map((version) => (
            <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Version {version.version}
                {dateText(version.uploadedAt) ? `, added ${dateText(version.uploadedAt)}` : ""}
              </span>
              {version.status === "uploading" ? null : (
                <DocumentDownload documentId={version.id} title={`${version.title}, version ${version.version}`} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
