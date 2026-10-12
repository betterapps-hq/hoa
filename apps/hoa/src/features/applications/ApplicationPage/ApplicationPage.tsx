import { useForm } from "@tanstack/react-form"
import { FileIcon, Trash2Icon } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { decisionOutcomes } from "@/applications/application"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
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
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { hasOpenRequests, type Review } from "@/review/reviewModel"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import {
  fileStatusLabels,
  outcomeLabels,
  packetFiles,
  recommendationLabels,
  statusLabels,
  type DecisionOutcome
} from "../applicationDisplay"
import type { ApplicationView } from "../applications.functions"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { ReviewDetail } from "../ReviewDetail/ReviewDetail"
import { ReviewReport } from "../ReviewReport/ReviewReport"
import { countOf, suggestedDecisions } from "../ReviewVerdict/ReviewVerdict.utils"

export type ApplicationActions = {
  upload: (files: File[]) => Promise<void>
  removeFile: (fileId: string) => Promise<void>
  runReview: () => Promise<void>
  submit: (confirmOpenRequests: boolean) => Promise<void>
  decide: (outcome: DecisionOutcome, note: string | null) => Promise<void>
}

export type ApplicationPageProps = {
  view: ApplicationView
  /** Who reads the page: the homeowner preparing the application, or the committee deciding it. */
  audience: ReviewAudience
  loadJob: (jobId: string) => Promise<Job | null>
  actions: ApplicationActions
  onChanged: () => void
  /** The governing documents' pages, for showing a cited provision where it is. */
  source?: CitationSource
  /** A packet photo's URL, for thumbnails beside what the review read from it. */
  loadImage?: (fileId: string) => Promise<string>
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

const isDecisionOutcome = (value: unknown): value is DecisionOutcome =>
  decisionOutcomes.some((outcome) => outcome === value)

const decisionSchema = z
  .object({
    outcome: z.string().refine(isDecisionOutcome, "Choose a decision."),
    note: z.string().trim().max(4000)
  })
  .superRefine((value, context) => {
    if (value.outcome !== "approved" && !value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explain the conditions, the parts approved, or what's needed."
      })
    }
  })

type DecisionFormProps = {
  /** The review: its recommendation preselects the decision, and its next steps can start the note. */
  review: Review
  /** A rule's title, for the review's rule markers. */
  ruleTitle: (ruleKey: string) => string
  onDecide: ApplicationActions["decide"]
}

/** What the homeowner has to provide and change, one line each, as a starting point for the note. */
const reviewNote = (review: Review, ruleTitle: (ruleKey: string) => string) =>
  [...review.missingInformation, ...review.changes]
    .map((item) => `- ${renderRuleMarkers(item.text, ruleTitle)}`)
    .join("\n")

/** The committee's decision: preselected to follow the review, with a note to the homeowner unless approved as is. */
function DecisionForm({ review, ruleTitle, onDecide }: DecisionFormProps) {
  const headingId = useId()
  const suggested = suggestedDecisions[review.recommendation]
  const note = reviewNote(review, ruleTitle)
  const form = useForm({
    defaultValues: { outcome: suggested ?? "", note: "" },
    validators: { onSubmit: decisionSchema },
    onSubmit: async ({ value }) => {
      const { outcome, note } = value
      if (isDecisionOutcome(outcome)) {
        await attempt(() => onDecide(outcome, note.trim() || null), "The decision wasn't saved.")
      }
    }
  })
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          Your decision
        </h2>
        <p className="text-sm text-muted-foreground">The review is a recommendation; the committee decides.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="outcome">
            {(field) => (
              <FieldSet data-invalid={field.state.meta.errors.length > 0}>
                <FieldLegend variant="label">Decision</FieldLegend>
                {suggested ? <FieldDescription>Preselected to follow the review.</FieldDescription> : null}
                <RadioGroup
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (isDecisionOutcome(value)) {
                      field.handleChange(value)
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
                <FieldError errors={field.state.meta.errors} />
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
                {note && !field.state.value ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto self-start p-0 text-link"
                    onClick={() => field.handleChange(note)}
                  >
                    Start from the review’s next steps
                  </Button>
                ) : null}
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
    </section>
  )
}

type AddFilesProps = {
  id: string
  size?: "default" | "compact"
  disabled: boolean
  onAdd: (files: File[]) => void
}

/** Takes files by drop or browse; they upload and the review runs again. Files it can't take are named with why. */
function AddFiles({ id, size = "default", disabled, onAdd }: AddFilesProps) {
  return (
    <FileDropzone
      id={id}
      target="application"
      size={size}
      disabled={disabled}
      onFiles={onAdd}
      prompt={size === "compact" ? "Add files" : undefined}
      className="w-full"
    />
  )
}

type PacketFileListProps = {
  view: ApplicationView
  isBusy: boolean
  onRemove: (fileId: string) => void
}

/** A packet file's state as an attachment shows it: read, being read, still uploading, or not readable. */
function fileState(status: ApplicationView["files"][number]["status"], isReading: boolean) {
  if (status === "unreadable") {
    return "error"
  }
  if (status === "uploading") {
    return "uploading"
  }
  return isReading ? "processing" : "done"
}

/** The files the homeowner uploaded, each with what the review made of it. */
function PacketFileList({ view, isBusy, onRemove }: PacketFileListProps) {
  const files = packetFiles(view.files)
  const isReviewing = view.application.status === "reviewing"
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files yet.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {files.map(({ file, pictures }) => {
        const isReading = isReviewing && file.status === "processing"
        return (
          <li key={file.id}>
            <Attachment className="w-full" state={fileState(file.status, isReading)}>
              <AttachmentMedia>
                <FileIcon aria-hidden />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle title={file.fileName}>{file.fileName}</AttachmentTitle>
                {/* What the review made of it, whole: a reason it couldn't be read is worth reading. */}
                <AttachmentDescription className="whitespace-normal">
                  {isReading ? "Reading" : fileStatusLabels[file.status]}
                  {file.pageCount ? `, ${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}` : ""}
                  {pictures.length > 0 ? `, ${pictures.length} ${pictures.length === 1 ? "picture" : "pictures"}` : ""}
                  {file.error ? `: ${file.error.message}` : ""}
                </AttachmentDescription>
              </AttachmentContent>
              {view.canEdit ? (
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`Remove ${file.fileName}`}
                    disabled={isBusy}
                    onClick={() => onRemove(file.id)}
                  >
                    <Trash2Icon />
                  </AttachmentAction>
                </AttachmentActions>
              ) : null}
            </Attachment>
          </li>
        )
      })}
    </ul>
  )
}

type HeaderProps = { view: ApplicationView }

/** The application's name, where it stands, and the homeowner's own description, quietly. */
function ApplicationHeader({ view }: HeaderProps) {
  const { application } = view
  const started = dateFormat.format(new Date(application.createdAt))
  const submitted = application.submittedAt ? dateFormat.format(new Date(application.submittedAt)) : null
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{view.projectTypeLabel ?? "Project"} application</h2>
      <p className="text-sm text-muted-foreground">
        {statusLabels[application.status]}. Started {started}
        {submitted ? `, submitted ${submitted}` : ""}.
      </p>
      {application.description ? (
        <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">{application.description}</p>
      ) : null}
    </header>
  )
}

type StageProps = { title: string; description: string; children?: ReactNode }

/** The top of the page before there's a review to show. */
function Stage({ title, description, children }: StageProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="max-w-prose text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * One application. With a review, its recommendation leads, then the next steps and the one thing to do now; the
 * packet, the rule matrix, the evidence and earlier reviews wait behind disclosure.
 */
export function ApplicationPage({
  view,
  audience,
  loadJob,
  actions,
  onChanged,
  source,
  loadImage
}: ApplicationPageProps) {
  const { application, review, job } = view
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const fileCount = packetFiles(view.files).length
  const isReviewing = application.status === "reviewing"
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
  const addFiles = (files: File[]) =>
    void busy(async () => {
      await actions.upload(files)
      await actions.runReview()
    }, "The files didn't upload.")
  const runReview = () => void busy(actions.runReview, "The review didn't start.")
  const removeFile = (fileId: string) => void busy(() => actions.removeFile(fileId), "The file wasn't removed.")
  const submit = (confirmOpenRequests: boolean) =>
    busy(async () => {
      await actions.submit(confirmOpenRequests)
      toast.success("Submitted to the committee.")
    }, "The application wasn't submitted.")

  const failed =
    !isReviewing && job?.status === "failed" ? (
      <Alert variant="destructive">
        <AlertTitle>The last review didn’t finish</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {job.error?.message ?? "Run the review again."}
          {view.canEdit && review ? (
            <Button variant="outline" size="sm" disabled={isBusy} onClick={runReview}>
              Run review again
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    ) : null

  const homeownerAction =
    review && view.canEdit ? (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canSubmit && !hasOpenRequests(review) ? (
            <Button disabled={isBusy} onClick={() => void submit(false)}>
              Submit to the committee
            </Button>
          ) : (
            <AddFiles id="add-files" disabled={isBusy} onAdd={addFiles} />
          )}
          {canSubmit && hasOpenRequests(review) ? (
            <Button variant="outline" disabled={isBusy} onClick={() => setIsConfirming(true)}>
              Submit anyway
            </Button>
          ) : null}
        </div>
        {canSubmit && !hasOpenRequests(review) ? (
          <AddFiles id="add-files" size="compact" disabled={isBusy} onAdd={addFiles} />
        ) : null}
        <p className="max-w-prose text-sm text-muted-foreground">
          {hasOpenRequests(review)
            ? "Add pages that show what’s missing, and the review runs again on the whole packet."
            : "The committee sees this review with your packet, and decides."}
        </p>
      </div>
    ) : null

  const action =
    audience === "committee" && view.canDecide && review ? (
      <DecisionForm
        review={review}
        ruleTitle={(ruleKey) => view.rules.find((rule) => rule.key === ruleKey)?.title ?? ruleKey}
        onDecide={(outcome, note) =>
          busy(() => actions.decide(outcome, note), "The decision wasn't saved.").then(() => undefined)
        }
      />
    ) : (
      homeownerAction
    )

  const packetDetail = (
    <ReviewDetail value="packet" title="Packet" meta={countOf(fileCount, "file", "files")}>
      <div className="flex flex-col gap-3">
        <PacketFileList view={view} isBusy={isBusy} onRemove={removeFile} />
        {view.canEdit ? (
          <Button variant="outline" size="sm" className="self-start" disabled={isBusy} onClick={runReview}>
            Run review again
          </Button>
        ) : null}
      </div>
    </ReviewDetail>
  )

  const historyDetail =
    view.history.length > 1 ? (
      <ReviewDetail value="history" title="Earlier reviews" meta={String(view.history.length - 1)}>
        <ul className="flex flex-col gap-1">
          {view.history.slice(1).map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-x-4">
              <span>{recommendationLabels[item.recommendation]}</span>
              <span className="text-muted-foreground">{dateFormat.format(new Date(item.createdAt))}</span>
            </li>
          ))}
        </ul>
      </ReviewDetail>
    ) : null

  const body = () => {
    if (isReviewing) {
      return (
        <Stage
          title="Reviewing"
          description="Reading the packet and checking it against the rulebook. This takes a few minutes."
        >
          {job ? <JobProgress jobId={job.id} loadJob={loadJob} onFinished={onChanged} /> : null}
          <PacketFileList view={view} isBusy={isBusy} onRemove={removeFile} />
        </Stage>
      )
    }
    if (review) {
      return (
        <ReviewReport
          context={createReviewContext({
            review,
            rules: view.rules,
            terms: view.terms,
            files: view.files,
            entityEvidence: view.entityEvidence,
            audience,
            source,
            loadImage
          })}
          decision={application.decision}
          isActing={audience === "homeowner" ? canSubmit : view.canDecide}
          action={action}
          details={
            <>
              {packetDetail}
              {historyDetail}
            </>
          }
        />
      )
    }
    return (
      <Stage
        title="Not reviewed yet"
        description="Add the packet’s files. The review reads them and checks the project against the rulebook."
      >
        <PacketFileList view={view} isBusy={isBusy} onRemove={removeFile} />
        {view.canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {fileCount > 0 ? (
              <Button disabled={isBusy} onClick={runReview}>
                Run review
              </Button>
            ) : null}
            <AddFiles id="add-files" size={fileCount > 0 ? "compact" : "default"} disabled={isBusy} onAdd={addFiles} />
          </div>
        ) : null}
      </Stage>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 lg:px-6">
      <ApplicationHeader view={view} />
      {failed}
      {body()}
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
