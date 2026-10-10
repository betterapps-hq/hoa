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
import { guessDocument } from "../guessDocument"
import type { DocumentDetails } from "../uploadDocument"

/** What the chosen file is: a new document, or a new version of the existing document with this id. */
const newDocument = "new"

const uploadSchema = z.object({
  target: z.string(),
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

type Relation = "edition" | "amendment"

type UploadValues = {
  target: string
  kind: GoverningDocument["kind"]
  title: string
  relation: Relation
  file: File | null
}

export type UploadDocumentDialogProps = {
  /** Mount it afresh for each opening (a new `key`), so it starts empty. */
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** The organization's documents, each its current version: the file can be a new version of any of them. */
  documents: readonly GoverningDocument[]
  onUpload: (file: File, details: DocumentDetails) => Promise<unknown>
  onUploaded: () => void
}

const required = (
  <span aria-hidden className="ml-0.5 text-destructive">
    *
  </span>
)

/**
 * Uploads a governing document (encoding.md, UX, Documents). Once a file is chosen it asks what the file is: a new
 * document, or a new version of an existing one (guessed from the file's name), which is a new edition that replaces it or an amendment that changes part of it. The rulebook is rebuilt once the
 * file is read.
 */
export function UploadDocumentDialog({
  isOpen,
  onOpenChange,
  documents,
  onUpload,
  onUploaded
}: UploadDocumentDialogProps) {
  const [error, setError] = useState<string | null>(null)
  // Once the person has said what the file is, a new file doesn't change the answer.
  const [isTargetChosen, setIsTargetChosen] = useState(false)
  const defaultValues: UploadValues = {
    target: newDocument,
    kind: "design-guidelines",
    title: "",
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
      const document = documents.find((item) => item.id === value.target) ?? null
      const isAmendment = document !== null && value.relation === "amendment"
      try {
        await onUpload(value.file, {
          kind: isAmendment ? "amendment" : (document?.kind ?? value.kind),
          title: value.title.trim(),
          effectiveDate: null,
          lineageId: document && !isAmendment ? document.lineageId : null,
          amends: isAmendment ? document.id : null
        })
        toast.success("Uploaded. The rulebook updates once the document is read.")
        onOpenChange(false)
        onUploaded()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The upload failed.")
      }
    }
  })

  /** The title a new version starts with: the document's own for an edition, the person's for anything else. */
  const titleFor = (target: string, relation: Relation) => {
    const document = documents.find((item) => item.id === target)
    return document && relation === "edition" ? document.title : ""
  }
  const chooseTarget = (target: string) => {
    if (target === form.getFieldValue("target")) {
      return
    }
    form.setFieldValue("target", target)
    form.setFieldValue("title", titleFor(target, form.getFieldValue("relation")))
  }
  const chooseRelation = (relation: Relation) => {
    form.setFieldValue("relation", relation)
    form.setFieldValue("title", titleFor(form.getFieldValue("target"), relation))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a governing document</DialogTitle>
          <DialogDescription>
            CC&amp;Rs, design guidelines, rules, amendments or the blank application form, or a new version of one you
            already have. The rulebook is rebuilt once it&rsquo;s read.
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
            <form.Field name="file">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="upload-file">File{required}</FieldLabel>
                  <FileDropzone
                    id="upload-file"
                    target="governing"
                    multiple={false}
                    value={field.state.value ? [{ file: field.state.value, kind: "" }] : []}
                    onChange={(files) => {
                      const file = files[0]?.file ?? null
                      field.handleChange(file)
                      if (file && !isTargetChosen) {
                        chooseTarget(guessDocument(file.name, documents)?.id ?? newDocument)
                      }
                    }}
                    isInvalid={field.state.meta.errors.length > 0}
                    describedBy="upload-file-pages"
                  />
                  <FieldDescription id="upload-file-pages">Up to 300 pages.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe
              selector={(state) => [state.values.file, state.values.target, state.values.relation] as const}
            >
              {([file, target, relation]) => {
                const document = documents.find((item) => item.id === target) ?? null
                return file ? (
                  <>
                    {documents.length > 0 ? (
                      <Field>
                        <FieldLabel id="upload-target-label">What is this file?</FieldLabel>
                        <RadioGroup
                          aria-labelledby="upload-target-label"
                          value={target}
                          onValueChange={(value) => {
                            setIsTargetChosen(true)
                            chooseTarget(String(value))
                          }}
                        >
                          <Field orientation="horizontal">
                            <RadioGroupItem value={newDocument} id="upload-target-new" />
                            <FieldLabel htmlFor="upload-target-new" className="font-normal">
                              A new document
                            </FieldLabel>
                          </Field>
                          {documents.map((item) => (
                            <Field key={item.id} orientation="horizontal">
                              <RadioGroupItem value={item.id} id={`upload-target-${item.id}`} />
                              <FieldLabel htmlFor={`upload-target-${item.id}`} className="font-normal">
                                A new version of {item.title}
                              </FieldLabel>
                            </Field>
                          ))}
                        </RadioGroup>
                      </Field>
                    ) : null}
                    {document ? (
                      <Field>
                        <FieldLabel id="upload-relation-label">How does it change {document.title}?</FieldLabel>
                        <RadioGroup
                          aria-labelledby="upload-relation-label"
                          value={relation}
                          onValueChange={(value) => chooseRelation(value === "amendment" ? "amendment" : "edition")}
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
                          <FieldLabel htmlFor="upload-title">
                            {document && relation === "amendment" ? "Title of the amendment" : "Title"}
                            {required}
                          </FieldLabel>
                          <Input
                            id="upload-title"
                            required
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            aria-invalid={field.state.meta.errors.length > 0}
                          />
                          <FieldError errors={field.state.meta.errors} />
                        </Field>
                      )}
                    </form.Field>
                  </>
                ) : null
              }}
            </form.Subscribe>
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
