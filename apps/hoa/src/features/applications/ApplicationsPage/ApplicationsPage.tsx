import { useForm } from "@tanstack/react-form"
import { CheckCircle2Icon, CircleIcon, ClipboardListIcon, HistoryIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { FileDropzone, type ChosenFile, type FileKind } from "@/components/FileDropzone/FileDropzone"
import { InfoTip } from "@/components/InfoTip/InfoTip"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import { answersSchema, emptyAnswers } from "@/projectTypes/answers"
import { projectAnswers, type ProjectAnswers, type ProjectDocument, type ProjectType } from "@/projectTypes/projectType"
import { validateUpload } from "@/storage/uploadRules"
import { CitationsOpenInSheet } from "../../documents/ReaderSheet/ReaderSheet"
import { ProjectForm } from "../../projectTypes/ProjectForm/ProjectForm"
import type { OfferedProjectType } from "../../projectTypes/projectTypes.functions"
import { recommendationLabels, statusLabels } from "../applicationDisplay"
import type { ApplicationListItem } from "../applications.functions"
import { ProjectTypePicker } from "../ProjectTypePicker/ProjectTypePicker"
import { uploadProblem } from "../uploadApplicationFiles"
import { clearDraft, draftFor, readDraft, saveDraft } from "./applicationDraft"
import { documentStatuses, guessKind, listNames, otherKind } from "./ApplicationsPage.utils"

// Starting an application (application-review.md, UX): choose the kind of project, describe it, answer the project
// type's questions, and add the files in one drop zone, saying what each one is against a checklist of the documents
// the rules ask for. The committee sees the list of applications instead.

const newApplicationSchema = z.object({
  projectTypeId: z.string().min(1, "Choose the kind of project, or Something else."),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters."),
  answers: projectAnswers,
  files: z.array(z.object({ file: z.instanceof(File), kind: z.string() }))
})

export type NewApplication = {
  projectTypeId: string | null
  answers: ProjectAnswers | null
  description: string | null
  files: File[]
  /** What each file was uploaded as, for files uploaded as one of the project type's documents. */
  purposes: Map<File, string>
}

export type ApplicationsPageProps = {
  applications: ApplicationListItem[]
  /** The organization's project types to choose from, with why their questions are asked; "Something else" is always offered. */
  projectTypes: OfferedProjectType[]
  /** Committee members see every application; homeowners see their own and can start one. */
  isCommittee: boolean
  onCreate: (application: NewApplication) => Promise<void>
  onOpen: (applicationId: string) => void
  /** Keeps a draft of the answers in this tab under this key (the organization's), restored after a reload. */
  draftKey?: string
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

const formatNames = { pdf: "PDF", docx: "Word", image: "JPEG or PNG" } as const

/** What a document upload tells the review about the file: the document it was uploaded as, and what it must show. */
function purposeOf(document: ProjectDocument) {
  const shows = document.mustShow.length > 0 ? `, which must show: ${document.mustShow.join("; ")}` : ""
  return `Uploaded as the ${document.label.toLowerCase()}${shows}.`
}

/** What a file can be for a project type: each of its documents, or something else. */
const kindsOf = (type: ProjectType | null): FileKind[] | null =>
  type && type.definition.documents.length > 0
    ? [
        ...type.definition.documents.map((document) => ({
          value: document.documentType,
          label: sentenceCase(document.label)
        })),
        { value: otherKind, label: "Other or several documents" }
      ]
    : null

type DocumentChecklistProps = { documents: readonly ProjectDocument[]; files: readonly ChosenFile[] }

/** Which of the documents the project type asks for are among the files, and which are still missing. */
function DocumentChecklist({ documents, files }: DocumentChecklistProps) {
  const statuses = documentStatuses(documents, files)
  const missing = statuses.filter((status) => status.document.isRequired && status.files.length === 0)
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
      <ul className="flex flex-col gap-2" aria-label="Documents to include">
        {statuses.map(({ document, files: added }) => {
          const isAdded = added.length > 0
          return (
            <li key={document.documentType} className="flex items-start gap-2 text-sm">
              {isAdded ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                <span className={isAdded ? "font-medium" : undefined}>
                  {sentenceCase(document.label)}
                  {document.isRequired ? (
                    <span aria-hidden className="ml-0.5 text-destructive">
                      *
                    </span>
                  ) : null}
                </span>
                <span className="sr-only">
                  {document.isRequired ? "Required. " : ""}
                  {isAdded ? "Added" : "Not added yet"}
                </span>
                {document.mustShow.length > 0 ? (
                  <InfoTip label={`What the ${document.label.toLowerCase()} must show`}>
                    <p className="font-medium">It must show</p>
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                      {document.mustShow.map((item) => (
                        <li key={item}>{sentenceCase(item)}</li>
                      ))}
                    </ul>
                  </InfoTip>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Still needed: {listNames(missing.map((status) => status.document.label.toLowerCase()))}. If one is inside
          another file, mark that file as other or several documents.
        </p>
      ) : null}
    </div>
  )
}

/** Saves the form's answers as they change, so they survive a reload. */
function KeepDraft({
  draftKey,
  projectTypeId,
  description,
  answers
}: {
  draftKey: string
  projectTypeId: string
  description: string
  answers: ProjectAnswers
}) {
  useEffect(() => {
    saveDraft(draftKey, projectTypeId, { description, answers })
  }, [draftKey, projectTypeId, description, answers])
  return null
}

/** A homeowner's applications with a form to start one, or the committee's queue. */
export function ApplicationsPage({
  applications,
  projectTypes,
  isCommittee,
  onCreate,
  onOpen,
  draftKey
}: ApplicationsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const [isRestored, setIsRestored] = useState(false)
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const typeOf = (id: string) => projectTypes.find((type) => type.id === id) ?? null
  const form = useForm({
    defaultValues: {
      projectTypeId: "",
      description: "",
      answers: {} as ProjectAnswers,
      files: [] as ChosenFile[]
    },
    validators: {
      onSubmit: newApplicationSchema.superRefine((value, context) => {
        const files = value.files.map((item) => item.file)
        if (files.length === 0) {
          context.addIssue({ code: "custom", path: ["files"], message: "Add your application packet." })
        }
        const problem = uploadProblem(files)
        if (problem) {
          context.addIssue({ code: "custom", path: ["files"], message: problem })
        }
        const type = typeOf(value.projectTypeId)
        for (const item of value.files) {
          const document = type?.definition.documents.find((entry) => entry.documentType === item.kind)
          const upload = validateUpload(item.file, "application")
          if (document?.accepts && upload.isValid && !document.accepts.includes(upload.upload.format)) {
            const names = document.accepts.map((format) => formatNames[format])
            context.addIssue({
              code: "custom",
              path: ["files"],
              message: `The ${document.label.toLowerCase()} takes ${listNames(names)} files; ${item.file.name} isn't one.`
            })
          }
        }
        if (type && !answersSchema(type.definition).safeParse(value.answers).success) {
          context.addIssue({ code: "custom", path: ["answers"], message: "Check the answers marked above." })
        }
      })
    },
    onSubmitInvalid: () => {
      setHasTriedSubmit(true)
      // Once the errors show, take the homeowner to the first one.
      setTimeout(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]:is(input, textarea, select, [role="button"])')
          ?.focus()
      }, 0)
    },
    onSubmit: async ({ value }) => {
      setError(null)
      const type = typeOf(value.projectTypeId)
      const purposes = new Map<File, string>()
      for (const item of value.files) {
        const document = type?.definition.documents.find((entry) => entry.documentType === item.kind)
        if (document) {
          purposes.set(item.file, purposeOf(document))
        }
      }
      try {
        await onCreate({
          projectTypeId: type?.id ?? null,
          answers: type ? value.answers : null,
          description: value.description.trim() || null,
          files: value.files.map((item) => item.file),
          purposes
        })
        if (draftKey) {
          clearDraft(draftKey)
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The application couldn't be created.")
      }
    }
  })

  // Answers typed before a reload or an accidental navigation come back (not the files, which can't be kept).
  useEffect(() => {
    const draft = draftKey ? readDraft(draftKey) : null
    const type = draft ? typeOf(draft.projectTypeId) : null
    const entry = draftFor(draft, draft?.projectTypeId ?? "")
    if (!type || !entry) {
      return
    }
    form.setFieldValue("projectTypeId", type.id)
    form.setFieldValue("description", entry.description)
    form.setFieldValue("answers", entry.answers)
    setIsRestored(true)
    // Only when the page opens.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {isCommittee ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Start an application</CardTitle>
            <CardDescription>
              The review runs as soon as you upload, so you can fix anything it finds before the committee sees it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRestored ? (
              <Alert className="mb-6">
                <HistoryIcon />
                <AlertTitle>We restored your answers</AlertTitle>
                <AlertDescription>Add your files again; they aren&rsquo;t kept.</AlertDescription>
                <AlertAction>
                  <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setIsRestored(false)}>
                    <XIcon />
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
            {draftKey ? (
              <form.Subscribe selector={(state) => state.values}>
                {(values) => (
                  <KeepDraft
                    draftKey={draftKey}
                    projectTypeId={values.projectTypeId}
                    description={values.description}
                    answers={values.answers}
                  />
                )}
              </form.Subscribe>
            ) : null}
            <CitationsOpenInSheet>
              <form
                ref={formRef}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  void form.handleSubmit()
                }}
              >
                <FieldGroup className="gap-8">
                  <form.Field
                    name="projectTypeId"
                    listeners={{
                      onChange: ({ value }) => {
                        const type = typeOf(value)
                        const kinds = kindsOf(type)
                        setHasTriedSubmit(false)
                        const drafted = draftKey && type ? draftFor(readDraft(draftKey), type.id) : null
                        form.setFieldValue("answers", drafted?.answers ?? (type ? emptyAnswers(type.definition) : {}))
                        form.setFieldValue(
                          "files",
                          form.getFieldValue("files").map((item) => ({
                            file: item.file,
                            kind: kinds ? guessKind(item.file.name, kinds) : ""
                          }))
                        )
                      }
                    }}
                  >
                    {(field) => (
                      <ProjectTypePicker
                        types={projectTypes}
                        value={field.state.value}
                        onChange={field.handleChange}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </form.Field>
                  <form.Subscribe selector={(state) => state.values.projectTypeId}>
                    {(projectTypeId) => {
                      if (projectTypeId === "") {
                        return null
                      }
                      const type = typeOf(projectTypeId)
                      const kinds = kindsOf(type)
                      const documents = type?.definition.documents ?? []
                      return (
                        <>
                          <FieldSeparator />
                          <form.Field name="description">
                            {(field) => (
                              <Field data-invalid={field.state.meta.errors.length > 0}>
                                <FieldLabel htmlFor={field.name}>Describe your project</FieldLabel>
                                <Textarea
                                  id={field.name}
                                  placeholder="What you plan to do, and where on your property"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  aria-invalid={field.state.meta.errors.length > 0}
                                />
                                <FieldError errors={field.state.meta.errors} />
                              </Field>
                            )}
                          </form.Field>
                          {type && type.definition.groups.length > 0 ? (
                            <>
                              <FieldSeparator />
                              <form.Field name="answers">
                                {(field) => (
                                  <ProjectForm
                                    key={type.id}
                                    definition={type.definition}
                                    value={field.state.value}
                                    onChange={field.handleChange}
                                    showsAllErrors={hasTriedSubmit}
                                    reasons={type.reasons}
                                  />
                                )}
                              </form.Field>
                            </>
                          ) : null}
                          <FieldSeparator />
                          <form.Field name="files">
                            {(field) => {
                              const isInvalid = field.state.meta.errors.length > 0
                              return (
                                <FieldSet data-invalid={isInvalid} className="min-w-0 gap-4">
                                  <FieldLegend className="mb-0">{kinds ? "Documents" : "Files"}</FieldLegend>
                                  <FieldDescription className="-mt-3">
                                    {kinds
                                      ? "Add your files, then choose what each one is."
                                      : "Your application packet and anything else you're submitting."}
                                  </FieldDescription>
                                  {documents.length > 0 ? (
                                    <DocumentChecklist documents={documents} files={field.state.value} />
                                  ) : null}
                                  <FileDropzone
                                    id="application-files"
                                    target="application"
                                    value={field.state.value}
                                    onChange={field.handleChange}
                                    kinds={kinds ?? undefined}
                                    guessKind={kinds ? (file) => guessKind(file.name, kinds) : undefined}
                                    isInvalid={isInvalid}
                                    describedBy={isInvalid ? "application-files-error" : undefined}
                                  />
                                  {isInvalid ? (
                                    <FieldError id="application-files-error" errors={field.state.meta.errors} />
                                  ) : null}
                                </FieldSet>
                              )
                            }}
                          </form.Field>
                          {error ? (
                            <p role="alert" className="text-sm text-destructive">
                              {error}
                            </p>
                          ) : null}
                          <form.Subscribe selector={(state) => state.isSubmitting}>
                            {(isSubmitting) => (
                              <Field orientation="horizontal">
                                <Button type="submit" size="lg" disabled={isSubmitting}>
                                  {isSubmitting ? <Spinner /> : null}
                                  {isSubmitting ? "Uploading" : "Upload and review"}
                                </Button>
                              </Field>
                            )}
                          </form.Subscribe>
                        </>
                      )
                    }}
                  </form.Subscribe>
                </FieldGroup>
              </form>
            </CitationsOpenInSheet>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isCommittee ? "Applications" : "Your applications"}</CardTitle>
          <CardDescription>
            {isCommittee
              ? "Submitted applications wait for the committee's decision."
              : "Open an application to add files, review it again or submit it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>No applications yet</EmptyTitle>
                <EmptyDescription>
                  {isCommittee ? "Applications appear here once homeowners start them." : "Start one above."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest review</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="max-w-80">
                      <div className="font-medium">{application.projectTypeLabel ?? "Something else"}</div>
                      {application.description ? (
                        <div className="truncate text-muted-foreground">{application.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={application.status === "submitted" ? "default" : "outline"}>
                        {statusLabels[application.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {application.recommendation ? recommendationLabels[application.recommendation] : "Not reviewed"}
                    </TableCell>
                    <TableCell>{dateFormat.format(new Date(application.updatedAt))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onOpen(application.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
