import { useForm } from "@tanstack/react-form"
import { FileIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { decisionOutcomes } from "@/applications/application"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { hasOpenRequests } from "@/review/reviewModel"
import { acceptFor } from "@/storage/uploadRules"
import {
  fileStatusLabels,
  outcomeLabels,
  packetFiles,
  recommendationLabels,
  statusLabels,
  type DecisionOutcome
} from "../applicationDisplay"
import type { ApplicationView } from "../applications.functions"
import { ReviewReport } from "../ReviewReport/ReviewReport"
import { uploadProblem } from "../uploadApplicationFiles"

export type ApplicationActions = {
  upload: (files: File[]) => Promise<void>
  removeFile: (fileId: string) => Promise<void>
  runReview: () => Promise<void>
  submit: (confirmOpenRequests: boolean) => Promise<void>
  decide: (outcome: DecisionOutcome, note: string | null) => Promise<void>
}

export type ApplicationPageProps = {
  view: ApplicationView
  loadJob: (jobId: string) => Promise<Job | null>
  actions: ApplicationActions
  onChanged: () => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

async function attempt(action: () => Promise<void>, fallback: string) {
  try {
    await action()
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : fallback)
    return false
  }
}

const decisionSchema = z
  .object({ outcome: z.enum(decisionOutcomes), note: z.string().trim().max(4000) })
  .superRefine((value, context) => {
    if (value.outcome !== "approved" && !value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explain the conditions, the parts approved, or what's needed."
      })
    }
  })

function DecisionForm({ onDecide }: { onDecide: ApplicationActions["decide"] }) {
  const form = useForm({
    defaultValues: { outcome: "approved" as DecisionOutcome, note: "" },
    validators: { onSubmit: decisionSchema },
    onSubmit: async ({ value }) => {
      await attempt(() => onDecide(value.outcome, value.note.trim() || null), "The decision wasn't saved.")
    }
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Committee decision</CardTitle>
        <CardDescription>The review is a recommendation; the committee decides.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="outcome">
              {(field) => (
                <FieldSet>
                  <FieldLegend variant="label">Decision</FieldLegend>
                  <RadioGroup
                    value={field.state.value}
                    onValueChange={(value) => {
                      const outcome = decisionOutcomes.find((item) => item === value)
                      if (outcome) {
                        field.handleChange(outcome)
                      }
                    }}
                  >
                    {decisionOutcomes.map((outcome) => (
                      <Field key={outcome} orientation="horizontal">
                        <RadioGroupItem id={`outcome-${outcome}`} value={outcome} />
                        <FieldLabel htmlFor={`outcome-${outcome}`} className="font-normal">
                          {outcomeLabels[outcome]}
                        </FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                </FieldSet>
              )}
            </form.Field>
            <form.Field name="note">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="decision-note">Note to the homeowner</FieldLabel>
                  <Textarea
                    id="decision-note"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldDescription>Required unless the application is approved as submitted.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Field orientation="horizontal">
                  <Button type="submit" disabled={isSubmitting}>
                    Record decision
                  </Button>
                </Field>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

/** One application: its packet, the latest review, submitting, and the committee's decision. */
export function ApplicationPage({ view, loadJob, actions, onChanged }: ApplicationPageProps) {
  const { application, review, job } = view
  const [selected, setSelected] = useState<File[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const files = packetFiles(view.files)
  const isReviewing = application.status === "reviewing"
  const problem = uploadProblem(selected)
  const canSubmit =
    view.isOwner &&
    review !== null &&
    (application.status === "reviewed" || application.status === "information-requested")

  const busy = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    const succeeded = await attempt(action, fallback)
    setIsBusy(false)
    onChanged()
    return succeeded
  }

  const uploadAndReview = () =>
    busy(async () => {
      await actions.upload(selected)
      setSelected([])
      setFileInputKey((key) => key + 1)
      await actions.runReview()
    }, "The files didn't upload.")

  const submit = (confirmOpenRequests: boolean) =>
    busy(async () => {
      await actions.submit(confirmOpenRequests)
      toast.success("Submitted to the committee.")
    }, "The application wasn't submitted.")

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{view.projectKindLabel ?? "Project"} application</CardTitle>
          <CardDescription>
            Started {dateFormat.format(new Date(application.createdAt))}
            {application.submittedAt ? `, submitted ${dateFormat.format(new Date(application.submittedAt))}` : ""}
          </CardDescription>
          <CardAction>
            <Badge variant={application.status === "submitted" ? "default" : "outline"}>
              {statusLabels[application.status]}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="whitespace-pre-line">{application.description ?? "No description."}</p>
          {application.decision ? (
            <Alert variant={application.decision.outcome === "disapproved" ? "destructive" : "default"}>
              <AlertTitle>Committee decision: {outcomeLabels[application.decision.outcome]}</AlertTitle>
              {application.decision.note ? <AlertDescription>{application.decision.note}</AlertDescription> : null}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packet</CardTitle>
          <CardDescription>PDF, Word, JPEG or PNG. Photos up to 5 MB each.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {files.map(({ file, pictures }) => (
                <li key={file.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{file.fileName}</span>
                    <span className="text-muted-foreground">
                      {isReviewing && file.status === "processing" ? "Reading" : fileStatusLabels[file.status]}
                      {file.pageCount ? `, ${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}` : ""}
                      {pictures.length > 0
                        ? `, ${pictures.length} ${pictures.length === 1 ? "picture" : "pictures"}`
                        : ""}
                      {file.error ? `: ${file.error.message}` : ""}
                    </span>
                  </div>
                  {view.canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${file.fileName}`}
                      disabled={isBusy}
                      onClick={() => void busy(() => actions.removeFile(file.id), "The file wasn't removed.")}
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {view.canEdit ? (
            <Field data-invalid={problem !== null}>
              <FieldLabel htmlFor="packet-files">Add files</FieldLabel>
              <Input
                key={fileInputKey}
                id="packet-files"
                type="file"
                multiple
                accept={acceptFor.application}
                onChange={(event) => setSelected([...(event.target.files ?? [])])}
                aria-invalid={problem !== null}
              />
              {problem ? <FieldError>{problem}</FieldError> : null}
            </Field>
          ) : null}
        </CardContent>
        {view.canEdit ? (
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              disabled={isBusy || selected.length === 0 || problem !== null}
              onClick={() => void uploadAndReview()}
            >
              {isBusy ? "Working" : "Upload and review"}
            </Button>
            <Button
              variant="outline"
              disabled={isBusy || files.length === 0}
              onClick={() => void busy(actions.runReview, "The review didn't start.")}
            >
              <RefreshCwIcon />
              {review ? "Run review again" : "Run review"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {isReviewing && job ? (
        <Card>
          <CardHeader>
            <CardTitle>Reviewing</CardTitle>
            <CardDescription>
              Reading the packet and checking it against the rulebook. This takes a few minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobProgress jobId={job.id} loadJob={loadJob} onFinished={onChanged} />
          </CardContent>
        </Card>
      ) : null}
      {!isReviewing && job?.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>The last review didn’t finish</AlertTitle>
          <AlertDescription>{job.error?.message ?? "Run the review again."}</AlertDescription>
        </Alert>
      ) : null}

      {review ? (
        <ReviewReport review={review} rules={view.rules} audience={view.isOwner ? "homeowner" : "committee"} />
      ) : null}

      {canSubmit && review ? (
        <Card>
          <CardHeader>
            <CardTitle>Submit to the committee</CardTitle>
            <CardDescription>
              The committee sees this review: {recommendationLabels[review.recommendation].toLowerCase()}.
              {hasOpenRequests(review)
                ? " It still asks for information. You can submit anyway, but the committee may deny an incomplete application."
                : ""}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              disabled={isBusy}
              onClick={() => (hasOpenRequests(review) ? setIsConfirming(true) : void submit(false))}
            >
              Submit
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {view.canDecide ? (
        <DecisionForm
          onDecide={(outcome, note) =>
            busy(() => actions.decide(outcome, note), "The decision wasn't saved.").then(() => undefined)
          }
        />
      ) : null}

      {view.history.length > 1 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Earlier reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {view.history.slice(1).map((item) => (
                <li key={item.id}>
                  {dateFormat.format(new Date(item.createdAt))}: {recommendationLabels[item.recommendation]}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with open requests?</AlertDialogTitle>
            <AlertDialogDescription>
              The review asks for information you haven’t provided. The committee may deny an incomplete application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsConfirming(false)
                void submit(true)
              }}
            >
              Submit anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
