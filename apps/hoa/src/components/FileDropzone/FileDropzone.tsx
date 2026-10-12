import { cn } from "cn"
import { UploadIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle
} from "@/components/ui/attachment"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { acceptedTypes, uploadHint, validateUpload, type UploadTarget } from "@/storage/uploadRules"
import { FileTypeMedia } from "../FileTypeMedia/FileTypeMedia"

// The app's one way to choose files (documents.md, Uploads): a drop zone that takes files by drag and drop or by
// browsing (click, Enter or Space), checks them against the target's rules in src/storage, and names each file it
// turns away with the reason. With a value it lists the chosen files, each removable and replaceable, and with kinds
// it asks what each one is.

/** A chosen file and, where the drop zone asks, what it is. */
export type ChosenFile = { file: File; kind: string }

export type FileKind = { value: string; label: string }

export type FileDropzoneProps = {
  /** The input's id, so a label can name the drop zone. */
  id: string
  /** Whose rules apply: what types and sizes it takes. */
  target: UploadTarget
  /** Several files, or one (a new one replaces it). */
  multiple?: boolean
  /** What the drop zone says; "Drag files here, or browse" by default. */
  prompt?: string
  disabled?: boolean
  isInvalid?: boolean
  /** Ids of what describes it, such as an error. */
  describedBy?: string
  /** The chosen files; leave out to hand files straight to `onFiles` instead. */
  value?: readonly ChosenFile[]
  onChange?: (files: ChosenFile[]) => void
  /** Called with every accepted drop, whether or not the drop zone keeps a list. */
  onFiles?: (files: File[]) => void
  /** What each file can be; with them, each listed file has a chooser. */
  kinds?: readonly FileKind[]
  /** A file's likely kind, or "" when it isn't clear. */
  guessKind?: (file: File) => string
  /** "compact" fits in a row of actions: one line, a little padding. */
  size?: "default" | "compact"
  className?: string
}

const sizeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function sizeText(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${sizeFormat.format(Math.max(bytes / 1024, 0.1))} KB`
  }
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`
}

/** Why a file was turned away, in the app's words. */
function reasonOf(rejection: FileRejection, target: UploadTarget, multiple: boolean) {
  const { file } = rejection
  const validation = validateUpload({ name: file.name, type: file.type, size: file.size }, target)
  if (!validation.isValid) {
    return validation.message
  }
  if (!multiple && rejection.errors.some((error) => error.code === "too-many-files")) {
    return "Choose one file."
  }
  return rejection.errors[0]?.message ?? `${file.name} can't be added.`
}

/** A drop zone for files, with the chosen ones listed when it keeps them. */
export function FileDropzone({
  id,
  target,
  multiple = true,
  prompt,
  disabled = false,
  isInvalid = false,
  describedBy,
  value,
  onChange,
  onFiles,
  kinds,
  guessKind,
  size = "default",
  className
}: FileDropzoneProps) {
  const [problems, setProblems] = useState<string[]>([])
  const [replacing, setReplacing] = useState<number | null>(null)
  const files = value ?? []
  const choose = (accepted: File[]) => {
    if (accepted.length === 0) {
      return
    }
    onFiles?.(accepted)
    if (!onChange) {
      return
    }
    const chosen = accepted.map((file) => ({ file, kind: guessKind?.(file) ?? "" }))
    const [first] = chosen
    if (replacing !== null && first) {
      onChange(files.map((item, index) => (index === replacing ? { ...first, kind: item.kind || first.kind } : item)))
    } else {
      onChange(multiple ? [...files, ...chosen] : chosen.slice(0, 1))
    }
  }
  const dropzone = useDropzone({
    accept: acceptedTypes(target),
    multiple: multiple && replacing === null,
    disabled,
    validator: (file) => {
      // Files dragged over the zone aren't readable yet; they're checked once dropped.
      if (!(file instanceof File)) {
        return null
      }
      const validation = validateUpload({ name: file.name, type: file.type, size: file.size }, target)
      return validation.isValid ? null : { code: "upload-rules", message: validation.message }
    },
    onDrop: (accepted, rejected) => {
      setProblems(rejected.map((rejection) => reasonOf(rejection, target, multiple && replacing === null)))
      choose(accepted)
      setReplacing(null)
    },
    onFileDialogCancel: () => setReplacing(null)
  })
  const hintId = `${id}-hint`
  const problemsId = `${id}-problems`
  const describers = [hintId, problems.length > 0 ? problemsId : null, describedBy].filter(Boolean).join(" ")
  const remove = (index: number) => onChange?.(files.filter((_, at) => at !== index))
  const replace = (index: number) => {
    setReplacing(index)
    dropzone.open()
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        {...dropzone.getRootProps({
          role: "button",
          "aria-label": prompt ?? (multiple ? "Add files" : "Choose a file"),
          "aria-describedby": describers,
          "aria-invalid": isInvalid || undefined,
          "aria-disabled": disabled || undefined
        })}
        className={cn(
          "flex cursor-pointer rounded-lg border border-dashed text-center transition-colors outline-none",
          size === "compact"
            ? "flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3"
            : "flex-col items-center gap-2 px-4 py-6",
          "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dropzone.isDragActive && "border-primary bg-primary/5",
          isInvalid && "border-destructive",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <input {...dropzone.getInputProps({ id })} />
        {size === "compact" ? (
          <UploadIcon className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UploadIcon className="size-5" aria-hidden />
          </span>
        )}
        <span className="text-sm font-medium">
          {dropzone.isDragActive ? (
            "Drop to add"
          ) : (
            <>
              {prompt ?? (multiple ? "Drag files here, or " : "Drag a file here, or ")}
              {prompt ? null : <span className="text-link underline underline-offset-4">browse</span>}
            </>
          )}
        </span>
        <span id={hintId} className="text-sm text-muted-foreground">
          {uploadHint(target)}
        </span>
      </div>
      {problems.length > 0 ? (
        <ul id={problemsId} role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {value && files.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Chosen files">
          {files.map((item, index) => (
            // Two files can share a name, so a file's place in the list is part of its identity.
            <li key={`${index}-${item.file.name}-${item.file.size}`} className="flex flex-col gap-2">
              <Attachment className="w-full">
                <FileTypeMedia fileName={item.file.name} mediaType={item.file.type} />
                <AttachmentContent>
                  <AttachmentTitle title={item.file.name}>{item.file.name}</AttachmentTitle>
                  <AttachmentDescription>{sizeText(item.file.size)}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    type="button"
                    size="xs"
                    disabled={disabled}
                    aria-label={`Replace ${item.file.name}`}
                    onClick={() => replace(index)}
                  >
                    Replace
                  </AttachmentAction>
                  <AttachmentAction
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => remove(index)}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
              {kinds ? (
                <NativeSelect
                  size="sm"
                  aria-label={`What ${item.file.name} is`}
                  value={item.kind}
                  onChange={(event) =>
                    onChange?.(files.map((file, at) => (at === index ? { ...file, kind: event.target.value } : file)))
                  }
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
          ))}
        </ul>
      ) : null}
    </div>
  )
}
