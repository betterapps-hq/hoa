import { useForm } from "@tanstack/react-form"
import { ClipboardListIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
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
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { answersSchema, emptyAnswers } from "@/projectTypes/answers"
import { projectAnswers, type ProjectAnswers, type ProjectDocument, type ProjectType } from "@/projectTypes/projectType"
import { acceptFor } from "@/storage/uploadRules"
import { ProjectForm, type AnswerIssue } from "../../projectTypes/ProjectForm/ProjectForm"
import { recommendationLabels, statusLabels } from "../applicationDisplay"
import type { ApplicationListItem } from "../applications.functions"
import { ProjectTypePicker } from "../ProjectTypePicker/ProjectTypePicker"
import { uploadProblem } from "../uploadApplicationFiles"

const newApplicationSchema = z.object({
  projectTypeId: z.string().min(1, "Choose the type of project, or Something else."),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters."),
  answers: projectAnswers,
  documents: z.record(z.string(), z.array(z.instanceof(File))),
  files: z.array(z.instanceof(File))
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
  /** The organization's project types to choose from; "Something else" is always offered. */
  projectTypes: ProjectType[]
  /** Committee members see every application; homeowners see their own and can start one. */
  isCommittee: boolean
  onCreate: (application: NewApplication) => Promise<void>
  onOpen: (applicationId: string) => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** What a document upload tells the review about the file: the document it was uploaded as, and what it must show. */
function purposeOf(document: ProjectDocument) {
  const shows = document.mustShow.length > 0 ? `, which must show: ${document.mustShow.join("; ")}` : ""
  return `Uploaded as the ${document.label.toLowerCase()}${shows}.`
}

/** A homeowner's applications with a form to start one, or the committee's queue. */
export function ApplicationsPage({ applications, projectTypes, isCommittee, onCreate, onOpen }: ApplicationsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const [answerIssues, setAnswerIssues] = useState<AnswerIssue[]>([])
  const typeOf = (id: string) => projectTypes.find((type) => type.id === id) ?? null
  const form = useForm({
    defaultValues: {
      projectTypeId: "",
      description: "",
      answers: {} as ProjectAnswers,
      documents: {} as Record<string, File[]>,
      files: [] as File[]
    },
    validators: {
      onSubmit: newApplicationSchema.superRefine((value, context) => {
        const type = typeOf(value.projectTypeId)
        const all = [...Object.values(type ? value.documents : {}).flat(), ...value.files]
        if (all.length === 0) {
          context.addIssue({ code: "custom", path: ["files"], message: "Add your application packet." })
        }
        const problem = uploadProblem(all)
        if (problem) {
          context.addIssue({ code: "custom", path: ["files"], message: problem })
        }
      })
    },
    onSubmit: async ({ value }) => {
      setError(null)
      const type = typeOf(value.projectTypeId)
      const parsed = type ? answersSchema(type.definition).safeParse(value.answers) : null
      setAnswerIssues(parsed?.success === false ? parsed.error.issues : [])
      if (parsed?.success === false) {
        return
      }
      const purposes = new Map<File, string>()
      for (const document of type?.definition.documents ?? []) {
        for (const file of value.documents[document.documentType] ?? []) {
          purposes.set(file, purposeOf(document))
        }
      }
      try {
        await onCreate({
          projectTypeId: type?.id ?? null,
          answers: type ? value.answers : null,
          description: value.description.trim() || null,
          files: [...purposes.keys(), ...value.files],
          purposes
        })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The application couldn't be created.")
      }
    }
  })

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {isCommittee ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Start an application</CardTitle>
            <CardDescription>
              Describe the project and add your packet. The review runs right away, so you can fix anything it finds
              before the committee sees it.
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
                <form.Field
                  name="projectTypeId"
                  listeners={{
                    onChange: ({ value }) => {
                      const type = typeOf(value)
                      setAnswerIssues([])
                      form.setFieldValue("answers", type ? emptyAnswers(type.definition) : {})
                      form.setFieldValue("documents", {})
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
                <form.Subscribe selector={(state) => typeOf(state.values.projectTypeId)}>
                  {(type) =>
                    type ? (
                      <>
                        <form.Field name="answers">
                          {(field) => (
                            <ProjectForm
                              definition={type.definition}
                              value={field.state.value}
                              onChange={field.handleChange}
                              issues={answerIssues}
                            />
                          )}
                        </form.Field>
                        {type.definition.documents.length > 0 ? (
                          <form.Field name="documents">
                            {(field) => (
                              <FieldSet>
                                <FieldLegend>Documents</FieldLegend>
                                <FieldDescription>
                                  The documents the rules ask for. Upload each one here, or include it in your files
                                  below.
                                </FieldDescription>
                                <FieldGroup>
                                  {type.definition.documents.map((document) => {
                                    const id = `document-${document.documentType}`
                                    return (
                                      <Field key={document.documentType}>
                                        <FieldLabel htmlFor={id}>{document.label}</FieldLabel>
                                        <Input
                                          id={id}
                                          type="file"
                                          multiple
                                          accept={acceptFor.application}
                                          onChange={(event) =>
                                            field.handleChange({
                                              ...field.state.value,
                                              [document.documentType]: [...(event.target.files ?? [])]
                                            })
                                          }
                                        />
                                        {document.mustShow.length > 0 ? (
                                          <FieldDescription>
                                            Must show: {document.mustShow.join("; ")}.
                                          </FieldDescription>
                                        ) : null}
                                      </Field>
                                    )
                                  })}
                                </FieldGroup>
                              </FieldSet>
                            )}
                          </form.Field>
                        ) : null}
                      </>
                    ) : null
                  }
                </form.Subscribe>
                <form.Field name="description">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Project description</FieldLabel>
                      <Textarea
                        id={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldDescription>Optional. The review reads it alongside your files.</FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="files">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Files</FieldLabel>
                      <Input
                        id={field.name}
                        type="file"
                        multiple
                        accept={acceptFor.application}
                        onChange={(event) => field.handleChange([...(event.target.files ?? [])])}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldDescription>
                        Your application packet and anything else you’re submitting. PDF, Word, JPEG or PNG; photos up
                        to 5 MB each.
                      </FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Field orientation="horizontal">
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Uploading" : "Upload and review"}
                      </Button>
                    </Field>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
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
