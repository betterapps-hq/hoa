import { useForm } from "@tanstack/react-form"
import { ArrowLeftIcon, DownloadIcon, Trash2Icon } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { decisionOutcomes, type Application, type ApplicationStatus } from "@/applications/application"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
import { FileTypeMedia } from "@/components/FileTypeMedia/FileTypeMedia"
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
  AttachmentTitle,
  AttachmentTrigger
} from "@/components/ui/attachment"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { cn } from "@/lib/utils"
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
import { applicationFileUrl } from "../applicationFile"
import type { ApplicationView } from "../applications.functions"
import { createReviewContext, ruleName, type ReviewAudience } from "../reviewContext"
import { ReviewReport, type ReportTab } from "../ReviewReport/ReviewReport"
import { verdictTones } from "../ReviewVerdict/ReviewVerdict"
import { decisionTones, suggestedDecisions } from "../ReviewVerdict/ReviewVerdict.utils"

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
  /** Back to the list of applications. */
  onBack: () => void
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

/**
 * The committee's decision as a card beside the review: each outcome a choice, the one that follows the review
 * marked and preselected, and a note to the homeowner unless approved as is.
 */
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
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 id={headingId}>Your decision</h3>
          </CardTitle>
          <CardDescription>The review is a recommendation; the committee decides.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-5">
              <form.Field name="outcome">
                {(field) => (
                  <FieldSet data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLegend className="sr-only">Decision</FieldLegend>
                    <RadioGroup
                      className="gap-2"
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (isDecisionOutcome(value)) {
                          field.handleChange(value)
                        }
                      }}
                    >
                      {decisionOutcomes.map((outcome) => (
                        <FieldLabel key={outcome} htmlFor={`outcome-${outcome}`}>
                          <Field orientation="horizontal" className="items-center gap-3 py-2.5!">
                            <RadioGroupItem id={`outcome-${outcome}`} value={outcome} />
                            <FieldContent className="gap-0.5">
                              <FieldTitle className="font-normal">{outcomeLabels[outcome]}</FieldTitle>
                              {outcome === suggested ? (
                                <FieldDescription className="text-xs">Recommended by the review</FieldDescription>
                              ) : null}
                            </FieldContent>
                          </Field>
                        </FieldLabel>
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
                      className="min-h-24"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldDescription>Required unless approved as submitted.</FieldDescription>
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
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    Record decision
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
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

/** The files the homeowner uploaded, each with what the review made of it; each opens, and saves. */
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
              <FileTypeMedia fileName={file.fileName} mediaType={file.mediaType} />
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
              {file.status === "uploading" ? null : (
                <AttachmentTrigger
                  render={
                    <a
                      href={applicationFileUrl(view.application.id, file.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${file.fileName}`}
                    />
                  }
                />
              )}
              <AttachmentActions>
                {file.status === "uploading" ? null : (
                  <a
                    className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                    href={applicationFileUrl(view.application.id, file.id, { download: true })}
                    download
                    aria-label={`Download ${file.fileName}`}
                    title="Download"
                  >
                    <DownloadIcon aria-hidden />
                  </a>
                )}
                {view.canEdit ? (
                  <AttachmentAction
                    aria-label={`Remove ${file.fileName}`}
                    title="Remove"
                    disabled={isBusy}
                    onClick={() => onRemove(file.id)}
                  >
                    <Trash2Icon />
                  </AttachmentAction>
                ) : null}
              </AttachmentActions>
            </Attachment>
          </li>
        )
      })}
    </ul>
  )
}

/** An application's status by color: waiting on the committee, on the homeowner, or decided. */
const statusDots: Record<ApplicationStatus, string> = {
  draft: "bg-muted-foreground/50",
  reviewing: "bg-sky-500",
  reviewed: "bg-muted-foreground/50",
  submitted: "bg-blue-500",
  "information-requested": "bg-amber-500",
  decided: "bg-green-500"
}

/** Where the application stands, as a badge with a colored dot; a decision takes its own outcome's color. */
function StatusBadge({ application }: { application: Application }) {
  const dot = application.decision
    ? verdictTones[decisionTones[application.decision.outcome]].dot
    : statusDots[application.status]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {statusLabels[application.status]}
    </Badge>
  )
}

type HeaderProps = { view: ApplicationView }

/** The application's name and where it stands, then the homeowner's own description. */
function ApplicationHeader({ view }: HeaderProps) {
  const { application } = view
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{view.projectTypeLabel ?? "Project"} application</h2>
        <StatusBadge application={application} />
      </div>
      {application.description ? (
        <p className="max-w-3xl text-pretty whitespace-pre-line text-muted-foreground">{application.description}</p>
      ) : null}
    </header>
  )
}

/** The application's facts beside the review: its kind, its dates and its files. */
function ApplicationDetails({ view }: HeaderProps) {
  const { application, review } = view
  const date = (value: string) => dateFormat.format(new Date(value))
  const rows = [
    { term: "Project", value: view.projectTypeLabel ?? "Something else" },
    { term: "Started", value: date(application.createdAt) }
  ]
  if (application.submittedAt) {
    rows.push({ term: "Submitted", value: date(application.submittedAt) })
  }
  if (review) {
    rows.push({ term: "Reviewed", value: `${date(review.createdAt)}${review.provisional ? ", provisional" : ""}` })
  }
  if (application.decision) {
    rows.push({ term: "Decided", value: date(application.decision.decidedAt) })
  }
  rows.push({ term: "Files", value: String(packetFiles(view.files).length) })
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h3>Details</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col divide-y">
          {rows.map(({ term, value }) => (
            <div key={term} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-right tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

type StageProps = { title: string; description: string; children?: ReactNode }

/** The application before there's a review to show: what's happening, and the packet. */
function Stage({ title, description, children }: StageProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </CardTitle>
          <CardDescription className="max-w-prose">{description}</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">{children}</CardContent>
      </Card>
    </section>
  )
}

/**
 * One application, as a record page: its name and status, then the review (the recommendation with its counts, and
 * tabs from the next steps to the packet's files) beside the one thing to do now and the application's details.
 */
export function ApplicationPage({
  view,
  audience,
  loadJob,
  actions,
  onChanged,
  onBack,
  source,
  loadImage
}: ApplicationPageProps) {
  const { application, review, job } = view
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [tab, setTab] = useState("overview")
  const fileCount = packetFiles(view.files).length
  const isReviewing = application.status === "reviewing"
  // The rule matrix wants the page's whole width, so the side column steps aside while it's open.
  const isWide = tab === "rules" && review !== null && !isReviewing
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

  const isOpen = review !== null && hasOpenRequests(review)
  const isSubmitFirst = canSubmit && !isOpen
  const homeownerAction =
    review && view.canEdit ? (
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{isSubmitFirst ? "Ready to submit" : "Add what’s missing"}</h3>
          </CardTitle>
          <CardDescription>
            {isOpen
              ? "Add pages that show what’s missing, and the review runs again on the whole packet."
              : "The committee sees this review with your packet, and decides."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSubmitFirst ? (
            <>
              <Button className="w-full" disabled={isBusy} onClick={() => void submit(false)}>
                Submit to the committee
              </Button>
              <AddFiles id="add-files" size="compact" disabled={isBusy} onAdd={addFiles} />
            </>
          ) : (
            <>
              <AddFiles id="add-files" disabled={isBusy} onAdd={addFiles} />
              {canSubmit ? (
                <Button variant="outline" className="w-full" disabled={isBusy} onClick={() => setIsConfirming(true)}>
                  Submit anyway
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    ) : null

  const action =
    audience === "committee" && view.canDecide && review ? (
      <DecisionForm
        review={review}
        ruleTitle={(ruleKey) => ruleName(new Map(view.rules.map((rule) => [rule.key, rule])), ruleKey)}
        onDecide={(outcome, note) =>
          busy(() => actions.decide(outcome, note), "The decision wasn't saved.").then(() => undefined)
        }
      />
    ) : (
      homeownerAction
    )

  const tabs: ReportTab[] = [
    {
      value: "files",
      label: "Files",
      count: fileCount,
      content: (
        <div className="flex flex-col gap-3">
          <PacketFileList view={view} isBusy={isBusy} onRemove={removeFile} />
          {view.canEdit ? (
            <Button variant="outline" size="sm" className="self-start" disabled={isBusy} onClick={runReview}>
              Run review again
            </Button>
          ) : null}
        </div>
      )
    }
  ]
  if (view.history.length > 1) {
    tabs.push({
      value: "history",
      label: "History",
      count: view.history.length,
      content: (
        <ul className="flex flex-col divide-y rounded-xl border">
          {view.history.map((item, index) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span className="flex items-center gap-2 font-medium">
                {recommendationLabels[item.recommendation]}
                {index === 0 ? <Badge variant="secondary">Latest</Badge> : null}
              </span>
              <span className="text-muted-foreground tabular-nums">{dateFormat.format(new Date(item.createdAt))}</span>
            </li>
          ))}
        </ul>
      )
    })
  }

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
          tabs={tabs}
          tab={tab}
          onTabChange={setTab}
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
          <div className="flex flex-col gap-3">
            {fileCount > 0 ? (
              <Button className="self-start" disabled={isBusy} onClick={runReview}>
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
          <ArrowLeftIcon />
          Applications
        </Button>
        <ApplicationHeader view={view} />
      </div>
      <div
        className={cn(
          "grid items-start gap-6",
          !isWide && "@4xl/main:grid-cols-[minmax(0,1fr)_19rem] @6xl/main:grid-cols-[minmax(0,1fr)_21rem]"
        )}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {failed}
          {body()}
        </div>
        {/* Hidden, not removed, beside a wide tab, so a decision being written keeps its words. */}
        <aside aria-label="About this application" hidden={isWide} className="flex min-w-0 flex-col gap-4">
          {action}
          <ApplicationDetails view={view} />
        </aside>
      </div>
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
