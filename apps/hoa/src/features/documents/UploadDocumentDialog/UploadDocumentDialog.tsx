import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { governingDocumentKinds, type GoverningDocument } from "@/documents/governingDocument"
import { validateUpload } from "@/storage/uploadRules"
import { documentKindLabels } from "../documentKinds"
import type { DocumentDetails } from "../uploadDocument"

const uploadSchema = z.object({
  kind: z.enum(governingDocumentKinds),
  title: z.string().trim().min(1, "Enter a title."),
  relation: z.enum(["edition", "amendment"]),
  file: z
    .instanceof(File, { message: "Choose a file." })
    .nullable()
    .superRefine((file, context) => {
      if (!file) {
        context.addIssue({ code: "custom", message: "Choose a file." })
        return
      }
      const result = validateUpload(file, "governing")
      if (!result.isValid) {
        context.addIssue({ code: "custom", message: result.message })
      }
    })
})

type UploadValues = {
  kind: GoverningDocument["kind"]
  title: string
  relation: "edition" | "amendment"
  file: File | null
}

export type UploadDocumentDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** The document a new version is for; null uploads a new document. */
  of: GoverningDocument | null
  onUpload: (file: File, details: DocumentDetails) => Promise<unknown>
  onUploaded: () => void
}

/**
 * Uploads a governing document, or a new version of one: a new edition that replaces it, or an amendment that changes
 * it. The rulebook is rebuilt once the file is read (encoding.md, UX).
 */
export function UploadDocumentDialog({ isOpen, onOpenChange, of, onUpload, onUploaded }: UploadDocumentDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const defaultValues: UploadValues = {
    kind: of?.kind ?? "design-guidelines",
    title: of?.title ?? "",
    relation: "edition",
    file: null
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: uploadSchema },
    onSubmit: async ({ value }) => {
      if (!value.file) {
        return
      }
      setError(null)
      const isAmendment = of !== null && value.relation === "amendment"
      try {
        await onUpload(value.file, {
          kind: isAmendment ? "amendment" : value.kind,
          title: value.title.trim(),
          effectiveDate: null,
          lineageId: of && !isAmendment ? of.lineageId : null,
          amends: isAmendment ? of.id : null
        })
        toast.success("Uploaded. The rulebook updates once the document is read.")
        onOpenChange(false)
        onUploaded()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The upload failed.")
      }
    }
  })

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          form.reset()
          setError(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{of ? `New version of ${of.title}` : "Upload a governing document"}</DialogTitle>
          <DialogDescription>
            {of
              ? "The rulebook is rebuilt from it once it’s read, and you review what changed before it’s published."
              : "CC&Rs, design guidelines, rules, amendments or the blank application form. The rulebook is rebuilt once it’s read."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="upload-document"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            {of ? (
              <form.Field name="relation">
                {(field) => (
                  <Field>
                    <FieldLabel id="upload-relation-label">What is it?</FieldLabel>
                    <RadioGroup
                      aria-labelledby="upload-relation-label"
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value === "amendment" ? "amendment" : "edition")}
                    >
                      <Field orientation="horizontal">
                        <RadioGroupItem value="edition" id="upload-edition" />
                        <FieldLabel htmlFor="upload-edition" className="font-normal">
                          A new edition that replaces it
                        </FieldLabel>
                      </Field>
                      <Field orientation="horizontal">
                        <RadioGroupItem value="amendment" id="upload-amendment" />
                        <FieldLabel htmlFor="upload-amendment" className="font-normal">
                          An amendment that changes part of it
                        </FieldLabel>
                      </Field>
                    </RadioGroup>
                  </Field>
                )}
              </form.Field>
            ) : (
              <form.Field name="kind">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="upload-kind">Kind</FieldLabel>
                    <NativeSelect
                      id="upload-kind"
                      className="w-full"
                      value={field.state.value}
                      onChange={(event) => {
                        const kind = governingDocumentKinds.find((item) => item === event.target.value)
                        if (kind) {
                          field.handleChange(kind)
                        }
                      }}
                    >
                      {governingDocumentKinds.map((kind) => (
                        <NativeSelectOption key={kind} value={kind}>
                          {documentKindLabels[kind]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              </form.Field>
            )}
            <form.Field name="title">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="upload-title">Title</FieldLabel>
                  <Input
                    id="upload-title"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="file">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="upload-file">File</FieldLabel>
                  <FileDropzone
                    id="upload-file"
                    target="governing"
                    multiple={false}
                    value={field.state.value ? [{ file: field.state.value, kind: "" }] : []}
                    onChange={(files) => field.handleChange(files[0]?.file ?? null)}
                    isInvalid={field.state.meta.errors.length > 0}
                    describedBy="upload-file-pages"
                  />
                  <FieldDescription id="upload-file-pages">Up to 300 pages.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" form="upload-document" disabled={isSubmitting}>
                {isSubmitting ? "Uploading" : "Upload"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
