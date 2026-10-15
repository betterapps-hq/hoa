import type { UploadItem as UploadItemData, Uploader } from "@uploadcn/core"
import { useUploader, type UseUploaderOptions } from "@uploadcn/react"
import { cn } from "cn"
import { match } from "ts-pattern"
import {
  Upload,
  UploadDropzone,
  UploadDropzoneDescription,
  UploadDropzoneHeader,
  UploadDropzoneMedia,
  UploadDropzoneTitle,
  UploadItem,
  UploadItemActions,
  UploadItemContent,
  UploadItemDescription,
  UploadItemMedia,
  UploadItemProgress,
  UploadItemTitle,
  UploadList
} from "@/components/ui/upload"
import { fileSizeText } from "@/lib/text"
import { uploadHint, uploadValidation, validateUpload, type UploadTarget } from "@/storage/uploadRules"

// The app's one way to choose and upload files (documents.md, Uploads), on UploadCN: a drop zone that takes files by
// drag and drop or by browsing (click, Enter or Space), checks them against the target's rules in src/storage, and
// lists each file with its progress, or why it was turned away.

/** An uploader whose files are checked against a target's rules before they're sent where its adapter says. */
export function useFileUploader<TResult>(target: UploadTarget, options: UseUploaderOptions<TResult>) {
  return useUploader<TResult>({ ...uploadValidation(target), ...options })
}

/** What a listed file says: its size, how far it's got, or what went wrong, in the app's words. */
export function fileStatusText(item: UploadItemData, target: UploadTarget) {
  return match(item.status)
    .with("rejected", () => {
      const validation = validateUpload(item.file, target)
      return validation.isValid ? (item.issues[0]?.message ?? `${item.name} can't be added.`) : validation.message
    })
    .with("error", () => `${item.name} didn't upload. Try again.`)
    .with("uploading", "paused", () =>
      [
        `${fileSizeText(item.progress.loaded)} of ${fileSizeText(item.size)}`,
        `${Math.round(item.progress.percent)}%`
      ].join(", ")
    )
    .with("success", () => `${fileSizeText(item.size)}, uploaded`)
    .otherwise(() => fileSizeText(item.size))
}

export type FileUploadProps<TResult> = {
  uploader: Uploader<TResult>
  /** Whose rules apply: what types and sizes it takes. */
  target: UploadTarget
  /** Several files, or one (a new one replaces it). */
  multiple?: boolean
  /** What the drop zone says; "Drag files here, or browse" by default. */
  prompt?: string
  /** The drop zone's name for screen readers; "Add files" or "Choose a file" by default. */
  label?: string
  /** The drop zone's id, so the page can point to it. */
  id?: string
  disabled?: boolean
  isInvalid?: boolean
  /** Ids of what describes it, such as an error. */
  describedBy?: string
  /** "compact" fits in a form: one row, a little padding. */
  size?: "default" | "compact"
  className?: string
}

/** A drop zone for files, with each chosen file listed with its progress. */
export function FileUpload<TResult>({
  uploader,
  target,
  multiple = true,
  prompt,
  label,
  id,
  disabled = false,
  isInvalid = false,
  describedBy,
  size = "default",
  className
}: FileUploadProps<TResult>) {
  const isCompact = size === "compact"
  const hintId = `${id ?? target}-hint`
  return (
    <Upload uploader={uploader} multiple={multiple} disabled={disabled} className={className}>
      <UploadDropzone
        id={id}
        size="sm"
        orientation={isCompact ? "horizontal" : "vertical"}
        aria-label={label ?? (multiple ? "Add files" : "Choose a file")}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(" ")}
        aria-invalid={isInvalid || undefined}
        className={cn(isInvalid && "border-destructive")}
      >
        <UploadDropzoneHeader className={cn(isCompact && "max-w-none")}>
          <UploadDropzoneMedia variant="icon" />
          <UploadDropzoneTitle className="text-sm">
            {prompt ?? (
              <>
                {multiple ? "Drag files here, or " : "Drag a file here, or "}
                <span className="text-link underline underline-offset-4">browse</span>
              </>
            )}
          </UploadDropzoneTitle>
          <UploadDropzoneDescription id={hintId}>{uploadHint(target)}</UploadDropzoneDescription>
        </UploadDropzoneHeader>
      </UploadDropzone>
      <UploadList aria-label={multiple ? "Chosen files" : "Chosen file"}>
        {(item) => (
          <UploadItem size="sm">
            <UploadItemMedia />
            <UploadItemContent>
              <UploadItemTitle />
              <UploadItemDescription>{fileStatusText(item, target)}</UploadItemDescription>
            </UploadItemContent>
            <UploadItemActions />
            <UploadItemProgress />
          </UploadItem>
        )}
      </UploadList>
    </Upload>
  )
}
