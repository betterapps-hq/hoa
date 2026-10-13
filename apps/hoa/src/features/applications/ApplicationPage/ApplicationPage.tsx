import { useForm } from "@tanstack/react-form"
import { ArrowLeftIcon, RotateCwIcon, SendIcon, Trash2Icon } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import {
  decisionOutcomes,
  reviewCoversLatest,
  type Application,
  type ApplicationFile,
  type ApplicationStatus
} from "@/applications/application"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
import { PageActions, type PageAction } from "@/components/PageActions/PageActions"
import type { RowAction } from "@/components/RowActions/RowActions"
import { SaveStatus } from "@/components/SaveStatus/SaveStatus"
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
import { CitationsOpenInSheet } from "@/features/documents/ReaderSheet/ReaderSheet"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import { useAutosave } from "@/hooks/useAutosave"
import type { Job } from "@/jobs/job"
import { cn } from "@/lib/utils"
import { answersSchema } from "@/projectTypes/answers"
import { hasOpenRequests, type Review } from "@/review/reviewModel"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import {
  outcomeLabels,
  packetFiles,
  recommendationLabels,
  statusLabels,
  type DecisionOutcome
} from "../applicationDisplay"
import { applicationFileUrl } from "../applicationFile"
import { ApplicationAnswers, ApplicationForm, type DraftContent } from "../ApplicationForm/ApplicationForm"
import type { ApplicationView } from "../applications.functions"
import { DocumentChecklist } from "../DocumentChecklist/DocumentChecklist"
import { guessKind, kindProblem, kindsOf } from "../fileKinds"
import { PacketFiles } from "../PacketFiles/PacketFiles"
import { createReviewContext, ruleName, type ReviewAudience } from "../reviewContext"
import { ReviewReport, type ReportTab } from "../ReviewReport/ReviewReport"
import { verdictTones } from "../ReviewVerdict/ReviewVerdict"
import { decisionTones, suggestedDecisions } from "../ReviewVerdict/ReviewVerdict.utils"

export type ApplicationActions = {
  /** Keeps what the homeowner has written so far. */
  save: (content: DraftContent) => Promise<void>
  /** Uploads files, each with what it was guessed to be. */
  upload: (files: File[], uploadedAs: ReadonlyMap<File, string>) => Promise<void>
  /** Says what a file is: one of the project type's documents, other, or nothing yet (null). */
  setUploadedAs: (fileId: string, uploadedAs: string | null) => Promise<void>
  removeFile: (fileId: string) => Promise<void>
  runReview: () => Promise<void>
  submit: (confirmOpenRequests: boolean) => Promise<void>
  /** Deletes a draft that was never submitted. */
  deleteDraft: () => Promise<void>
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

/** How long typing waits for a pause before the draft is saved, in milliseconds. */
const saveDelay = 800

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

/** Takes files by drop or browse, and they upload to the application. Files it can't take are named with why. */
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

/** The application's name and where it stands, then the homeowner's own description unless it's being edited below. */
function ApplicationHeader({ view }: HeaderProps) {
  const { application } = view
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{view.projectTypeLabel ?? "Project"} application</h2>
        <StatusBadge application={application} />
      </div>
      {application.description && !view.canEdit ? (
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

/** A part of the application before there's a review to show: a heading, what it's for, and its content. */
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

/** A card beside the application with what the homeowner does next, and why. */
function NextCard({ title, description, children }: StageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  )
}

/**
 * One application, as a record page: its name and status, then the review (the recommendation with its counts, and
 * tabs from the next steps to the packet's files) beside the one thing to do now and the application's details. While
 * it's a draft, the homeowner's description, answers and files are edited in place and kept as they change; the review
 * runs when they ask for it.
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
  const { application, review, job, projectType } = view
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showsAllErrors, setShowsAllErrors] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  // The review shown when the homeowner last changed something here, so the page knows it no longer covers the
  // application before the page loads again; undefined until they change something.
  const [changedUnder, setChangedUnder] = useState<string | null | undefined>(undefined)
  const mainId = useId()
  const draft = useAutosave<DraftContent>(
    { description: application.description ?? "", answers: application.answers },
    actions.save,
    { delay: saveDelay }
  )
  const definition = projectType?.definition ?? null
  const kinds = kindsOf(definition)
  const files = packetFiles(view.files)
  const fileCount = files.length
  const isReviewing = application.status === "reviewing"
  const isStale = review !== null && (!reviewCoversLatest(application, review) || changedUnder === review.id)
  const canSubmit =
    view.isOwner &&
    review !== null &&
    !isStale &&
    (application.status === "reviewed" || application.status === "information-requested")
  const canDelete =
    view.isOwner && application.submittedAt === null && ["draft", "reviewed"].includes(application.status)

  const busy = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    const succeeded = await attempt(action, fallback)
    setIsBusy(false)
    onChanged()
    return succeeded
  }
  const changed = () => setChangedUnder(review?.id ?? null)
  const changeContent = (next: DraftContent) => {
    changed()
    draft.update(() => next)
  }
  const addFiles = (added: File[]) =>
    void busy(async () => {
      // Each file starts as what its name says, where that's clear and its format suits.
      const uploadedAs = new Map<File, string>()
      for (const file of added) {
        const guess = kinds ? guessKind(file.name, kinds) : ""
        if (guess && !kindProblem(file, definition, guess)) {
          uploadedAs.set(file, guess)
        }
      }
      changed()
      setFilesError(null)
      await actions.upload(added, uploadedAs)
    }, "The files didn't upload.")
  const chooseKind = async (file: ApplicationFile, kind: string | null) => {
    const problem = kind
      ? kindProblem({ name: file.fileName, type: file.mediaType, size: file.sizeBytes }, definition, kind)
      : null
    if (problem) {
      toast.error(problem)
      return false
    }
    changed()
    return busy(() => actions.setUploadedAs(file.id, kind), "That wasn't saved.")
  }
  const removeFile = (fileId: string) =>
    void busy(async () => {
      changed()
      await actions.removeFile(fileId)
    }, "The file wasn't removed.")

  /** What stops the review from running, shown where it is; null when the application is ready. */
  const problemBeforeReview = () => {
    if (definition && !answersSchema(definition).safeParse(draft.value.answers ?? {}).success) {
      setShowsAllErrors(true)
      // Once the errors show, take the homeowner to the first one.
      setTimeout(() => {
        document
          .getElementById(mainId)
          ?.querySelector<HTMLElement>('[aria-invalid="true"]:is(input, textarea, select, [role="button"])')
          ?.focus()
      }, 0)
      return "Answer the questions marked as required first."
    }
    if (fileCount === 0) {
      setFilesError("Add your application packet.")
      return "Add your application packet first."
    }
    if (files.some(({ file }) => file.status === "uploading")) {
      return "Wait for every file to finish uploading."
    }
    return null
  }
  const runReview = () =>
    void busy(async () => {
      const problem = problemBeforeReview()
      if (problem) {
        throw new Error(problem)
      }
      if (!(await draft.flush())) {
        throw new Error("Your latest changes aren't saved yet. Try again.")
      }
      await actions.runReview()
    }, "The review didn't start.")
  const submit = (confirmOpenRequests: boolean) =>
    busy(async () => {
      await actions.submit(confirmOpenRequests)
      toast.success("Submitted to the committee.")
    }, "The application wasn't submitted.")
  const deleteDraft = async () => {
    setIsBusy(true)
    draft.discard()
    if (await attempt(actions.deleteDraft, "The draft wasn't deleted.")) {
      toast.success("Draft deleted.")
      onBack()
    } else {
      setIsBusy(false)
    }
  }

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
  // The page's actions (ux.md, Page actions): running the review while there's none or it's out of date, submitting
  // once nothing is open; running it again, submitting with requests open, and deleting a draft, in the menu.
  const canRunReview = view.canEdit && !isReviewing
  const reviewAction: PageAction | null =
    canRunReview && (!review || isStale)
      ? { label: review ? "Run review again" : "Run review", isBusy, onSelect: runReview }
      : null
  const submitFirst: PageAction | null = isSubmitFirst
    ? { label: "Submit to the committee", isBusy, onSelect: () => void submit(false) }
    : null
  const more: RowAction[] = [
    ...(canRunReview && review && !isStale
      ? [{ label: "Run review again", icon: RotateCwIcon, disabled: isBusy, onSelect: runReview }]
      : []),
    ...(canSubmit && isOpen
      ? [{ label: "Submit anyway", icon: SendIcon, disabled: isBusy, onSelect: () => setIsConfirming(true) }]
      : []),
    ...(canDelete
      ? [
          {
            label: "Delete the draft",
            icon: Trash2Icon,
            isDestructive: true,
            disabled: isBusy,
            onSelect: () => setIsDeleting(true)
          }
        ]
      : [])
  ]

  const content = view.canEdit ? (
    <ApplicationForm
      projectType={projectType}
      value={draft.value}
      onChange={changeContent}
      showsAllErrors={showsAllErrors}
    />
  ) : (
    <ApplicationAnswers projectType={projectType} description={application.description} answers={application.answers} />
  )
  const packet = (
    <PacketFiles
      applicationId={application.id}
      files={view.files}
      isReviewing={isReviewing}
      canEdit={view.canEdit}
      isBusy={isBusy}
      onRemove={removeFile}
      kinds={kinds}
      onChooseKind={chooseKind}
    />
  )
  const documents = definition?.documents ?? []
  const filesSection = view.canEdit ? (
    <div className="flex flex-col gap-4">
      {documents.length > 0 && application.projectTypeId ? (
        <DocumentChecklist
          projectTypeId={application.projectTypeId}
          documents={documents}
          files={files.map(({ file }) => ({ name: file.fileName, kind: file.uploadedAs }))}
        />
      ) : null}
      {packet}
      <AddFiles id="add-files" size={fileCount > 0 ? "compact" : "default"} disabled={isBusy} onAdd={addFiles} />
      {filesError ? <FieldError>{filesError}</FieldError> : null}
    </div>
  ) : (
    packet
  )

  const homeownerAction = (() => {
    if (!view.canEdit) {
      return null
    }
    if (!review) {
      return (
        <NextCard
          title="When you’re ready"
          description="Your draft is saved as you go, so you can leave and come back. When it’s ready, run the review: it checks your project against the rules, so you can fix anything before you submit it to the committee."
        />
      )
    }
    if (isStale) {
      return (
        <NextCard
          title="Run the review again"
          description="You’ve changed the application since this review. Run it again to check your changes before you submit."
        />
      )
    }
    return (
      <NextCard
        title={isSubmitFirst ? "Ready to submit" : "Add what’s missing"}
        description={
          isOpen
            ? "Add pages or answers that show what’s missing, then run the review again."
            : "The committee sees this review with your packet, and decides."
        }
      >
        <AddFiles
          id="add-missing-files"
          size={isSubmitFirst ? "compact" : "default"}
          disabled={isBusy}
          onAdd={addFiles}
        />
      </NextCard>
    )
  })()

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
    { value: "application", label: "Application", content },
    { value: "files", label: "Files", count: fileCount, content: filesSection }
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
          {packet}
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
            loadImage,
            fileUrl: (fileId) => applicationFileUrl(application.id, fileId)
          })}
          decision={application.decision}
          tabs={tabs}
        />
      )
    }
    if (view.canEdit) {
      return (
        <>
          <Stage
            title="Your project"
            description="Tell the committee what you plan to do. Everything here is saved as you type."
          >
            {content}
          </Stage>
          <Stage
            title={kinds ? "Documents" : "Files"}
            description={
              kinds
                ? "Add your files, then choose what each one is."
                : "Your application packet and anything else you’re submitting."
            }
          >
            {filesSection}
          </Stage>
        </>
      )
    }
    return (
      <Stage title="Not reviewed yet" description="The review reads the packet and checks it against the rulebook.">
        {packet}
      </Stage>
    )
  }

  return (
    // Reading a citation is a step in reading the application: it opens over the page, not in place of it.
    <CitationsOpenInSheet>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 lg:px-6">
        <PageActions
          primary={reviewAction ?? submitFirst}
          more={more}
          status={view.canEdit ? <SaveStatus state={draft.state} onRetry={draft.retry} /> : undefined}
        />
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
            <ArrowLeftIcon />
            Applications
          </Button>
          <ApplicationHeader view={view} />
        </div>
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_19rem] @6xl/main:grid-cols-[minmax(0,1fr)_21rem]">
          <div id={mainId} className="flex min-w-0 flex-col gap-6">
            {failed}
            {body()}
          </div>
          <aside aria-label="About this application" className="flex min-w-0 flex-col gap-4">
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
        <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                Its answers, files and reviews are deleted for good. This can’t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep the draft</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setIsDeleting(false)
                  void deleteDraft()
                }}
              >
                Delete the draft
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CitationsOpenInSheet>
  )
}
