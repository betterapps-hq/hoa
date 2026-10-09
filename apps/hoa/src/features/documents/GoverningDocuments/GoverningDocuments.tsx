import { BookOpenTextIcon, ChevronDownIcon, FileTextIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { GoverningDocument } from "@/documents/governingDocument"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { DocumentFileLinks } from "../DocumentFileLinks/DocumentFileLinks"
import { documentKindLabels, documentVersions } from "../documentKinds"
import { DocumentSheet } from "../DocumentSheet/DocumentSheet"
import type { CitationSource, ViewerDocument } from "../DocumentViewer/DocumentViewer"
import type { DocumentDetails } from "../uploadDocument"
import { UploadDocumentDialog } from "../UploadDocumentDialog/UploadDocumentDialog"

export type GoverningDocumentsProps = {
  uploads: GoverningDocument[]
  /** The documents' pages, for reading one here. */
  source: CitationSource
  /** The running job for each document being read, by document id. */
  jobs: Record<string, string>
  loadJob: (jobId: string) => Promise<Job | null>
  /** With this, an administrator can upload documents and new versions of them. */
  onUpload?: (file: File, details: DocumentDetails) => Promise<unknown>
  onChanged: () => void
  /** How many documents show before "Show all". */
  initialCount?: number
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
 * versions here; the rulebook is rebuilt from them once they're read.
 */
export function GoverningDocuments({
  uploads,
  source,
  jobs,
  loadJob,
  onUpload,
  onChanged,
  initialCount = 6
}: GoverningDocumentsProps) {
  const [uploadFor, setUploadFor] = useState<GoverningDocument | null | undefined>(undefined)
  const [isAllShown, setIsAllShown] = useState(false)
  const [reading, setReading] = useState<ViewerDocument | null>(null)
  const documents = documentVersions(uploads)
  const shown = isAllShown ? documents : documents.slice(0, initialCount)

  return (
    <section aria-labelledby="governing-documents" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="governing-documents" className="text-base font-semibold">
          Governing documents
        </h2>
        {onUpload && documents.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setUploadFor(null)}>
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
                ? "Upload the CC&Rs, design guidelines and other governing documents. The rulebook is built from them."
                : "The association hasn’t added its governing documents yet."}
            </EmptyDescription>
          </EmptyHeader>
          {onUpload ? (
            <EmptyContent>
              <Button onClick={() => setUploadFor(null)}>
                <UploadIcon />
                Upload a document
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ul className="@container flex flex-col divide-y rounded-lg border">
          {shown.map(({ latest, earlier }) => (
            <li key={latest.lineageId} className="flex flex-col gap-1 px-4 py-3">
              <DocumentRow
                document={latest}
                jobId={jobs[latest.id]}
                loadJob={loadJob}
                onChanged={onChanged}
                onRead={
                  latest.status === "ready" && latest.pageCount
                    ? () => setReading({ id: latest.id, title: latest.title, pageCount: latest.pageCount ?? 1 })
                    : undefined
                }
                onNewVersion={onUpload ? () => setUploadFor(latest) : undefined}
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
      <DocumentSheet document={reading} source={source} onClose={() => setReading(null)} />
      {onUpload ? (
        <UploadDocumentDialog
          key={uploadFor?.id ?? "new"}
          isOpen={uploadFor !== undefined}
          onOpenChange={(open) => (open ? undefined : setUploadFor(undefined))}
          of={uploadFor ?? null}
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
  onRead,
  onNewVersion
}: {
  document: GoverningDocument
  jobId: string | undefined
  loadJob: GoverningDocumentsProps["loadJob"]
  onChanged: () => void
  onRead?: () => void
  onNewVersion?: () => void
}) {
  const details = [
    documentKindLabels[document.kind],
    document.version > 1 ? `version ${document.version}` : null,
    document.pageCount ? `${document.pageCount} pages` : null,
    dateText(document.uploadedAt) ? `added ${dateText(document.uploadedAt)}` : null
  ].filter((item) => item !== null)
  return (
    <div className="flex flex-col gap-2 @xl:flex-row @xl:items-start @xl:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{document.title}</span>
        <span className="text-sm text-muted-foreground">{details.join(", ")}</span>
        {document.status === "processing" && jobId ? (
          <JobProgress jobId={jobId} loadJob={loadJob} onFinished={onChanged} />
        ) : null}
        {document.status === "processing" && !jobId ? (
          <span className="text-sm text-muted-foreground">Being read</span>
        ) : null}
        {document.status === "uploading" ? (
          <span className="text-sm text-muted-foreground">The upload didn&rsquo;t finish.</span>
        ) : null}
        {document.status === "failed" ? (
          <span className="text-sm text-destructive">
            It couldn&rsquo;t be read{document.error ? `: ${document.error.message}` : "."}
          </span>
        ) : null}
      </div>
      <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 @xl:ml-0">
        {onRead ? (
          <Button size="sm" variant="ghost" onClick={onRead}>
            <BookOpenTextIcon />
            Read
            <span className="sr-only"> {document.title}</span>
          </Button>
        ) : null}
        {document.status === "uploading" ? null : <DocumentFileLinks documentId={document.id} title={document.title} />}
        {onNewVersion ? (
          <Button size="sm" variant="ghost" onClick={onNewVersion}>
            <UploadIcon />
            New version
            <span className="sr-only"> of {document.title}</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
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
                <DocumentFileLinks documentId={version.id} title={`${version.title}, version ${version.version}`} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
