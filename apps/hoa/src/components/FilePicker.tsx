import { FileTextIcon, XIcon } from "lucide-react"
import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export type FilePickerProps = {
  label: string
  hint: string
  accept: string
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

/** A multi-file input that lists the chosen files and lets each one be removed. */
export function FilePicker({ label, hint, accept, files, onChange, disabled }: FilePickerProps) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const added = Array.from(event.target.files ?? [])
          onChange([...files, ...added.filter((file) => !files.some((existing) => existing.name === file.name))])
          event.target.value = ""
        }}
      />
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      {files.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={`Selected ${label.toLowerCase()}`}>
          {files.map((file) => (
            <li key={file.name} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3 text-sm">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 break-words">{file.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => onChange(files.filter((existing) => existing !== file))}
                aria-label={`Remove ${file.name}`}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
