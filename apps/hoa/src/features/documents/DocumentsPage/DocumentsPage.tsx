import { useForm } from "@tanstack/react-form"
import { FileTextIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { governingDocumentKinds, type GoverningDocument } from "@/documents/governingDocument"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { acceptFor, validateUpload } from "@/storage/uploadRules"
import type { DocumentDetails } from "../uploadDocument"

export const documentKindLabels: Record<GoverningDocument["kind"], string> = {
  declaration: "Declaration (CC&Rs)",
  bylaws: "Bylaws",
  "rules-and-regulations": "Rules and regulations",
  "design-guidelines": "Design guidelines",
  amendment: "Amendment",
  form: "Form or checklist"
}

const statusLabels: Record<GoverningDocument["status"], string> = {
  uploading: "Uploading",
  processing: "Reading",
  ready: "Ready",
  failed: "Failed"
}

const uploadSchema = z.object({
  kind: z.enum(governingDocumentKinds),
  title: z.string().trim().min(1, "Enter a title."),
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

type UploadValues = { kind: GoverningDocument["kind"]; title: string; file: File | null }
const defaultValues: UploadValues = { kind: "design-guidelines", title: "", file: null }

export type DocumentsPageProps = {
  documents: GoverningDocument[]
  /** The running job for each document being read, by document id. */
  jobs: Record<string, string>
  onUpload: (file: File, details: DocumentDetails) => Promise<{ documentId: string; jobId: string | null }>
  loadJob: (jobId: string) => Promise<Job | null>
  onChanged: () => void
}

/** The administrator's governing documents: upload, then OCR at upload, with progress. */
export function DocumentsPage({ documents, jobs, onUpload, loadJob, onChanged }: DocumentsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const form = useForm({
    defaultValues,
    validators: { onSubmit: uploadSchema },
    onSubmit: async ({ value, formApi }) => {
      if (!value.file) {
        return
      }
      setError(null)
      try {
        await onUpload(value.file, { kind: value.kind, title: value.title.trim(), effectiveDate: null })
        formApi.reset()
        setFileInputKey((key) => key + 1)
        onChanged()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The upload failed.")
      }
    }
  })

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload a governing document</CardTitle>
          <CardDescription>
            CC&Rs, design guidelines, amendments and the HOA’s blank application form. Each file is read once, when it’s
            uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="kind">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Kind</FieldLabel>
                    <NativeSelect
                      id={field.name}
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
              <form.Field name="title">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                      placeholder="Residential design guidelines"
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              <form.Field name="file">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={field.name}>File</FieldLabel>
                    <Input
                      key={fileInputKey}
                      id={field.name}
                      type="file"
                      accept={acceptFor.governing}
                      onChange={(event) => field.handleChange(event.target.files?.[0] ?? null)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldDescription>PDF or Word, up to 50 MB and 300 pages.</FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Field orientation="horizontal">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Uploading" : "Upload"}
                    </Button>
                  </Field>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>The documents rulebooks are built from.</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>Upload the CC&Rs and design guidelines to build the rulebook.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => {
                  const jobId = jobs[document.id]
                  return (
                    <TableRow key={document.id}>
                      <TableCell className="font-medium">
                        {document.title}
                        {document.version > 1 ? (
                          <span className="text-muted-foreground"> (version {document.version})</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{documentKindLabels[document.kind]}</TableCell>
                      <TableCell>{document.pageCount ?? ""}</TableCell>
                      <TableCell>
                        {document.status === "processing" && jobId ? (
                          <JobProgress jobId={jobId} loadJob={loadJob} onFinished={onChanged} />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Badge variant={document.status === "failed" ? "destructive" : "outline"} className="w-fit">
                              {statusLabels[document.status]}
                            </Badge>
                            {document.error ? (
                              <span className="text-sm text-muted-foreground">{document.error.message}</span>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
