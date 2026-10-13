import { DownloadIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import type { ApplicationFile } from "@/applications/application"
import type { FileKind } from "@/components/FileDropzone/FileDropzone"
import { FileTypeMedia } from "@/components/FileTypeMedia/FileTypeMedia"
import { ImageViewer } from "@/components/ImageViewer/ImageViewer"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle,
  AttachmentTrigger
} from "@/components/ui/attachment"
import { buttonVariants } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"
import { fileStatusLabels, packetFiles } from "../applicationDisplay"
import { applicationFileUrl, opensInBrowser } from "../applicationFile"

export type PacketFilesProps = {
  applicationId: string
  files: readonly ApplicationFile[]
  /** While a review runs, a file it hasn't read yet is being read. */
  isReviewing: boolean
  /** Whether the homeowner can still remove files and say what each one is. */
  canEdit: boolean
  isBusy: boolean
  onRemove: (fileId: string) => void
  /** What each file can be, when the project type lists documents: a chooser to edit, a label to read. */
  kinds?: readonly FileKind[] | null
  /** Says what a file is; resolves false when that wasn't saved. */
  onChooseKind?: (file: ApplicationFile, kind: string | null) => Promise<boolean>
}

/** A packet file's state as an attachment shows it: read, being read, still uploading, or not readable. */
function fileState(status: ApplicationFile["status"], isReading: boolean) {
  if (status === "unreadable") {
    return "error"
  }
  if (status === "uploading") {
    return "uploading"
  }
  return isReading ? "processing" : "done"
}

/**
 * The files the homeowner uploaded, each with what the review made of it and what the homeowner said it is; each
 * opens, and saves.
 */
export function PacketFiles({
  applicationId,
  files: all,
  isReviewing,
  canEdit,
  isBusy,
  onRemove,
  kinds,
  onChooseKind
}: PacketFilesProps) {
  const files = packetFiles(all)
  // A photo opens in the viewer over the page; the last one shown stays named while the viewer closes.
  const [viewed, setViewed] = useState<{ id: string; fileName: string } | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  // A choice shows at once, and goes back if it isn't saved.
  const [chosen, setChosen] = useState<Record<string, string>>({})
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files yet.</p>
  }
  const choose = async (file: ApplicationFile, value: string) => {
    setChosen((current) => ({ ...current, [file.id]: value }))
    if (onChooseKind && !(await onChooseKind(file, value || null))) {
      setChosen((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== file.id)))
    }
  }
  const kindLabel = (value: string | null) => kinds?.find((kind) => kind.value === value)?.label ?? null
  return (
    <>
      <ul className={cn("flex flex-col", kinds && canEdit ? "gap-4" : "gap-2")}>
        {files.map(({ file, pictures }) => {
          const isReading = isReviewing && file.status === "processing"
          const uploadedAs = canEdit ? null : kindLabel(file.uploadedAs)
          // A photo opens in the viewer; any other file in a new tab, or the browser saves it.
          const trigger =
            file.mediaType.startsWith("image/") && opensInBrowser(file.mediaType) ? (
              <AttachmentTrigger
                aria-label={`View ${file.fileName}`}
                className="cursor-zoom-in"
                onClick={() => {
                  setViewed(file)
                  setIsViewerOpen(true)
                }}
              />
            ) : (
              <AttachmentTrigger
                render={
                  <a
                    href={applicationFileUrl(applicationId, file.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${file.fileName}`}
                  />
                }
              />
            )
          return (
            <li key={file.id} className="flex flex-col gap-2">
              <Attachment className="w-full" state={fileState(file.status, isReading)}>
                <FileTypeMedia fileName={file.fileName} mediaType={file.mediaType} />
                <AttachmentContent>
                  <AttachmentTitle title={file.fileName}>{file.fileName}</AttachmentTitle>
                  {/* What the review made of it, whole: a reason it couldn't be read is worth reading. */}
                  <AttachmentDescription className="whitespace-normal">
                    {uploadedAs ? `${uploadedAs}, ` : ""}
                    {isReading ? "Reading" : fileStatusLabels[file.status]}
                    {file.pageCount ? `, ${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}` : ""}
                    {pictures.length > 0
                      ? `, ${pictures.length} ${pictures.length === 1 ? "picture" : "pictures"}`
                      : ""}
                    {file.error ? `: ${file.error.message}` : ""}
                  </AttachmentDescription>
                </AttachmentContent>
                {file.status === "uploading" ? null : trigger}
                <AttachmentActions>
                  {file.status === "uploading" ? null : (
                    <a
                      className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                      href={applicationFileUrl(applicationId, file.id, { download: true })}
                      download
                      aria-label={`Download ${file.fileName}`}
                      title="Download"
                    >
                      <DownloadIcon aria-hidden />
                    </a>
                  )}
                  {canEdit ? (
                    <AttachmentAction
                      aria-label={`Remove ${file.fileName}`}
                      title="Remove"
                      disabled={isBusy}
                      onClick={() => onRemove(file.id)}
                    >
                      <Trash2Icon />
                    </AttachmentAction>
                  ) : null}
                </AttachmentActions>
              </Attachment>
              {kinds && canEdit && onChooseKind ? (
                <NativeSelect
                  size="sm"
                  aria-label={`What ${file.fileName} is`}
                  value={chosen[file.id] ?? file.uploadedAs ?? ""}
                  disabled={isBusy}
                  onChange={(event) => void choose(file, event.target.value)}
                  className="w-full"
                >
                  <NativeSelectOption value="">Choose what it is</NativeSelectOption>
                  {kinds.map((kind) => (
                    <NativeSelectOption key={kind.value} value={kind.value}>
                      {kind.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : null}
            </li>
          )
        })}
      </ul>
      <ImageViewer
        src={viewed ? applicationFileUrl(applicationId, viewed.id) : undefined}
        name={viewed?.fileName ?? ""}
        open={isViewerOpen}
        onOpenChange={setIsViewerOpen}
      />
    </>
  )
}
