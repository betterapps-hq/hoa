import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import {
  canSee,
  decisionOutcomes,
  deleteAfterFor,
  reviewCoversLatest,
  type Application,
  type ApplicationFile,
  type ApplicationStatus
} from "@/applications/application"
import { isUploadedAs, uploadContext } from "@/applications/uploadedAs"
import {
  createApplication as createApplicationRecord,
  createApplicationFile,
  deleteApplicationFile,
  deleteDraftApplication,
  getApplication,
  getApplicationFile,
  listApplicationFiles,
  listApplications as listApplicationRecords,
  listReviewSummaries,
  transitionApplication,
  updateApplicationFile,
  type ApplicationPatch,
  type ReviewSummary
} from "@/db/applicationRepository"
import { getDb } from "@/db/client.server"
import { listGoverningDocuments } from "@/db/documentRepository"
import { deleteJobsOf, getLatestJob, insertJob, newJob } from "@/db/jobRepository"
import { getProjectType, listProjectTypes } from "@/db/projectTypeRepository"
import { getPublishedRulesFile, type RulesFileRef } from "@/db/rulebookContentRepository"
import type { Job } from "@/jobs/job"
import { answersSchema, emptyAnswers } from "@/projectTypes/answers"
import { projectAnswers, type ProjectType } from "@/projectTypes/projectType"
import { toEvidence } from "@/review/factSchema"
import { hasOpenRequests, reviewSchema, type Recommendation, type Review } from "@/review/reviewModel"
import { subjectsAnswerSchema } from "@/review/subjects"
import { readRulesFile } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import { getRequestContext, requireAdministrator, type RequestContext } from "@/session/requestContext.server"
import { applicationKeys, jobOutputPrefix, jobStepKey, rulebookKeys } from "@/storage/keys"
import { deleteObjectsUnder, getJson, toBase64 } from "@/storage/objects"
import { getBucket, presignerOrNull } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"
import { offerType, type OfferedProjectType, type PublishedRules } from "../projectTypes/offeredTypes"
import type { SourceFile } from "../rulebook/rulebook.functions"
import { reportRules, reviewTerms, type ReportRule } from "./applicationView"

// Applications (docs/design/platform.md, "Server functions"): the homeowner starts one as a draft, which keeps their
// answers and files as they go, runs the review as often as they like and submits; the committee decides.

/** Statuses in which the homeowner can change files and run the review. */
const editableStatuses: readonly ApplicationStatus[] = ["draft", "reviewed", "information-requested"]

/** Who's asking, for what they may see: the committee sees an application once it's submitted. */
const viewerOf = (context: RequestContext) => ({
  userId: context.user.id,
  isCommittee: context.role === "administrator"
})

/** The application, if the requester may see it: its owner, or an administrator once it's been submitted. */
async function loadApplication(context: RequestContext, applicationId: string) {
  const application = await getApplication(getDb(), context.hoa.id, applicationId)
  if (!application || !canSee(application, viewerOf(context))) {
    throw new Error("The application doesn't exist.")
  }
  return application
}

/** The application, if the requester owns it and it can still be changed. */
async function loadEditable(context: RequestContext, applicationId: string) {
  const application = await loadApplication(context, applicationId)
  if (application.createdBy !== context.user.id) {
    throw new Error("Only the homeowner who created the application can change it.")
  }
  if (!editableStatuses.includes(application.status)) {
    throw new Error("The application can't be changed now.")
  }
  return application
}

/**
 * Records a change to what the application says, with any fields that changed: when, so a review from before no
 * longer covers it, and a draft's retention counted from now. Refused once a review has started.
 */
async function revise(context: RequestContext, application: Application, patch: ApplicationPatch = {}) {
  const now = new Date().toISOString()
  const [updated] = await transitionApplication(getDb(), context.hoa.id, application.id, editableStatuses, {
    ...patch,
    revisedAt: now,
    updatedAt: now,
    deleteAfter: deleteAfterFor({ ...application, updatedAt: now }, context.hoa.settings)
  })
  if (!updated) {
    throw new Error("The application can't be changed while it's being reviewed.")
  }
}

/** The form of the application's project type; null for "Something else" or a type that's gone. */
async function definitionOf(hoaId: string, application: Application) {
  const type = application.projectTypeId ? await getProjectType(getDb(), hoaId, application.projectTypeId) : null
  return type?.definition ?? null
}

/** Starts an application as a draft of the chosen kind of project, its form blank. */
export const createApplication = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ projectTypeId: z.string().nullable() }).parse(data))
  .handler(async ({ data }): Promise<Application> => {
    const context = await getRequestContext()
    const now = new Date().toISOString()
    const type = data.projectTypeId ? await getProjectType(getDb(), context.hoa.id, data.projectTypeId) : null
    if (data.projectTypeId && type?.status !== "active") {
      throw new Error("That project type isn't offered. Choose another, or Something else.")
    }
    return createApplicationRecord(getDb(), {
      hoaId: context.hoa.id,
      projectTypeId: type?.id ?? null,
      answers: type ? emptyAnswers(type.definition) : null,
      description: null,
      createdBy: context.user.id,
      now,
      deleteAfter:
        deleteAfterFor({ status: "draft", updatedAt: now, decision: null, submittedAt: null }, context.hoa.settings) ??
        now
    })
  })

/** The most a draft's answers can take up, written out. */
const answersLimit = 100_000

/**
 * Saves what the homeowner has written so far, as they go: the description and the form's answers, kept as given,
 * finished or not. The review checks the answers against the form when it runs.
 */
export const saveApplication = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        applicationId: z.string(),
        description: z.string().max(4000, "Keep the description under 4,000 characters."),
        answers: projectAnswers
          .nullable()
          .refine((answers) => JSON.stringify(answers).length <= answersLimit, "The answers are too long.")
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const application = await loadEditable(context, data.applicationId)
    await revise(context, application, {
      description: data.description.trim() || null,
      answers: application.projectTypeId ? data.answers : null
    })
  })

export type CreateFileUploadResult = { fileId: string; uploadUrl: string | null; contentType: string }

/** Records an application file and returns where to upload it. */
export const createApplicationUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        applicationId: z.string(),
        fileName: z.string().min(1),
        mediaType: z.string(),
        sizeBytes: z.number().int().positive(),
        /** What the homeowner says it is (src/applications/uploadedAs.ts); one that doesn't fit the form is left out. */
        uploadedAs: z.string().nullable().optional()
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<CreateFileUploadResult> => {
    const context = await getRequestContext()
    const application = await loadEditable(context, data.applicationId)
    const validation = validateUpload(
      { name: data.fileName, type: data.mediaType, size: data.sizeBytes },
      "application"
    )
    if (!validation.isValid) {
      throw new Error(validation.message)
    }
    const definition = await definitionOf(context.hoa.id, application)
    const uploadedAs = data.uploadedAs && isUploadedAs(definition, data.uploadedAs) ? data.uploadedAs : null
    await revise(context, application)
    const file = await createApplicationFile(getDb(), {
      hoaId: context.hoa.id,
      applicationId: application.id,
      fileName: data.fileName,
      mediaType: validation.upload.mediaType,
      sizeBytes: data.sizeBytes,
      uploadedAs,
      contextText: uploadContext(definition, uploadedAs),
      now: new Date().toISOString()
    })
    const key = applicationKeys(context.hoa.id, application.id).source(file.id, file.fileName)
    const presigner = presignerOrNull()
    return { fileId: file.id, uploadUrl: presigner ? await presigner.upload(key) : null, contentType: file.mediaType }
  })

async function loadUploadingFile(context: RequestContext, fileId: string) {
  const file = await getApplicationFile(getDb(), context.hoa.id, fileId)
  if (!file) {
    throw new Error("The file doesn't exist.")
  }
  await loadEditable(context, file.applicationId)
  return file
}

/** Uploads through the Worker when the environment has no R2 API token for presigned URLs. */
export const uploadApplicationFile = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data.")
    }
    const fileId = data.get("fileId")
    const file = data.get("file")
    if (typeof fileId !== "string" || !(file instanceof File)) {
      throw new Error("Expected a file id and a file.")
    }
    return { fileId, file }
  })
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const record = await loadUploadingFile(context, data.fileId)
    if (record.status !== "uploading") {
      throw new Error("This upload has already been completed.")
    }
    const key = applicationKeys(context.hoa.id, record.applicationId).source(record.id, record.fileName)
    await getBucket().put(key, data.file, { httpMetadata: { contentType: record.mediaType } })
  })

/** Confirms the file is in storage. It's read when the review runs. */
export const completeApplicationUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const record = await loadUploadingFile(context, data.fileId)
    if (record.status !== "uploading") {
      return
    }
    const key = applicationKeys(context.hoa.id, record.applicationId).source(record.id, record.fileName)
    const object = await getBucket().head(key)
    if (!object || object.size !== record.sizeBytes) {
      throw new Error("The upload didn't finish. Try again.")
    }
    await updateApplicationFile(getDb(), context.hoa.id, record.id, { status: "processing" })
  })

/** Says what a file is: one of the project type's documents, other, or nothing yet (null). */
export const setApplicationFileUploadedAs = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fileId: z.string(), uploadedAs: z.string().nullable() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const record = await getApplicationFile(getDb(), context.hoa.id, data.fileId)
    if (!record || record.parentFileId) {
      throw new Error("The file can't be changed.")
    }
    const application = await loadEditable(context, record.applicationId)
    const definition = await definitionOf(context.hoa.id, application)
    if (data.uploadedAs !== null && !isUploadedAs(definition, data.uploadedAs)) {
      throw new Error("Choose one of the documents the project lists, or other.")
    }
    await revise(context, application)
    await updateApplicationFile(getDb(), context.hoa.id, record.id, {
      uploadedAs: data.uploadedAs,
      contextText: uploadContext(definition, data.uploadedAs)
    })
  })

/** Removes a file, and any pictures taken from it, with everything stored for them, before the next review. */
export const removeApplicationFile = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const record = await getApplicationFile(getDb(), context.hoa.id, data.fileId)
    if (!record || record.parentFileId) {
      throw new Error("The file can't be removed.")
    }
    const application = await loadEditable(context, record.applicationId)
    await revise(context, application)
    const removed = await deleteApplicationFile(getDb(), context.hoa.id, record.id)
    const keys = applicationKeys(context.hoa.id, application.id)
    for (const id of removed) {
      await deleteObjectsUnder(getBucket(), `${keys.root}files/${id}/`)
    }
  })

/** Deletes a draft that was never submitted, with everything stored for it: its files, reviews and their jobs. */
export const deleteApplicationDraft = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ applicationId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const application = await loadApplication(context, data.applicationId)
    if (application.createdBy !== context.user.id) {
      throw new Error("Only the homeowner who started the application can delete it.")
    }
    const db = getDb()
    if (!(await deleteDraftApplication(db, context.hoa.id, application.id))) {
      throw new Error("Only a draft that was never submitted can be deleted, and not while it's being reviewed.")
    }
    const jobIds = await deleteJobsOf(db, context.hoa.id, application.id)
    await deleteObjectsUnder(getBucket(), applicationKeys(context.hoa.id, application.id).root)
    for (const jobId of jobIds) {
      await deleteObjectsUnder(getBucket(), jobOutputPrefix(context.hoa.id, jobId))
    }
  })

/** Starts a review of the current files; allowed while the application can be changed. */
export const runReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ applicationId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const application = await loadEditable(context, data.applicationId)
    const db = getDb()
    const files = await listApplicationFiles(db, context.hoa.id, application.id)
    if (files.some((file) => file.status === "uploading")) {
      throw new Error("Wait for every file to finish uploading.")
    }
    if (!files.some((file) => file.parentFileId === null)) {
      throw new Error("Add at least one file first.")
    }
    // A draft keeps answers half done; the review needs them finished, as the form checks them.
    const definition = await definitionOf(context.hoa.id, application)
    if (definition && !answersSchema(definition).safeParse(application.answers ?? {}).success) {
      throw new Error("Answer the questions marked as required first.")
    }
    if (!(await getPublishedRulesFile(db, context.hoa.id))) {
      throw new Error("The HOA hasn't published its rulebook yet, so applications can't be reviewed.")
    }
    const now = new Date().toISOString()
    const job = newJob({ hoaId: context.hoa.id, kind: "application-review", subjectId: application.id, now })
    const [claimed] = await db.batch([
      transitionApplication(db, context.hoa.id, application.id, editableStatuses, {
        status: "reviewing",
        updatedAt: now
      }),
      insertJob(db, job)
    ])
    if (claimed.length === 0) {
      throw new Error("A review is already running.")
    }
    await bindings.APPLICATION_REVIEW.create({
      id: job.id,
      params: {
        hoaId: context.hoa.id,
        applicationId: application.id,
        jobId: job.id,
        previousStatus: application.status
      }
    })
    return { jobId: job.id }
  })

async function loadReview(hoaId: string, applicationId: string, reviewId: string | null): Promise<Review | null> {
  return reviewId ? getJson(getBucket(), applicationKeys(hoaId, applicationId).review(reviewId), reviewSchema) : null
}

/** Sends the application to the committee with its latest review. Open requests need the homeowner's confirmation. */
export const submitApplication = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ applicationId: z.string(), confirmOpenRequests: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const application = await loadEditable(context, data.applicationId)
    const review = await loadReview(context.hoa.id, application.id, application.reviewId)
    if (!review || application.status === "draft") {
      throw new Error("Run the review before submitting.")
    }
    if (!reviewCoversLatest(application, review)) {
      throw new Error("You changed the application after the review. Run the review again before submitting.")
    }
    if (hasOpenRequests(review) && !data.confirmOpenRequests) {
      throw new Error("Confirm that you're submitting with open requests.")
    }
    const now = new Date().toISOString()
    const [updated] = await transitionApplication(
      getDb(),
      context.hoa.id,
      application.id,
      ["reviewed", "information-requested"],
      { status: "submitted", submittedReviewId: review.id, submittedAt: now, updatedAt: now, deleteAfter: null }
    )
    if (!updated) {
      throw new Error("The application can't be submitted now.")
    }
  })

/** The committee's decision on a submitted application. "Information requested" reopens it for the homeowner. */
export const recordDecision = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        applicationId: z.string(),
        outcome: z.enum(decisionOutcomes),
        note: z.string().trim().max(4000).nullable()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const now = new Date().toISOString()
    const decision = { outcome: data.outcome, note: data.note || null, decidedBy: context.user.id, decidedAt: now }
    const status: ApplicationStatus = data.outcome === "information-requested" ? "information-requested" : "decided"
    const [updated] = await transitionApplication(getDb(), context.hoa.id, data.applicationId, ["submitted"], {
      status,
      decision,
      updatedAt: now,
      deleteAfter: deleteAfterFor({ status, updatedAt: now, decision, submittedAt: null }, context.hoa.settings)
    })
    if (!updated) {
      throw new Error("Only a submitted application can be decided.")
    }
  })

export type ApplicationListItem = Application & {
  recommendation: Recommendation | null
  /** The project type's label; null for "Something else". */
  projectTypeLabel: string | null
}

/**
 * A rules file the pages read labels and rule text from. A file storage can't serve (or whose hash doesn't match)
 * is logged and left out, so the application pages still show the applications and their reviews.
 */
async function readRulesFileForDisplay(ref: RulesFileRef) {
  try {
    return await readRulesFile(getBucket(), ref)
  } catch (error) {
    console.error(error)
    return null
  }
}

/** The published rulebook's id and rules file, or null before the HOA publishes one. */
async function loadPublishedRules(hoaId: string): Promise<PublishedRules | null> {
  const published = await getPublishedRulesFile(getDb(), hoaId)
  const rulesFile = published ? await readRulesFileForDisplay(published) : null
  return published && rulesFile ? { id: published.rulebookId, rulesFile } : null
}

const today = () => new Date().toISOString().slice(0, 10)

/** The project type's label, from the organization's types; null for "Something else" or a removed type. */
const typeLabel = (types: readonly ProjectType[], id: string | null) =>
  id === null ? null : (types.find((type) => type.id === id)?.label ?? null)

/** A homeowner's own applications, or every application for the committee, with their latest recommendation. */
export const listApplications = createServerFn({ method: "GET" }).handler(async (): Promise<ApplicationListItem[]> => {
  const context = await getRequestContext()
  const db = getDb()
  const applications = (
    await listApplicationRecords(
      db,
      context.hoa.id,
      context.role === "administrator" ? {} : { createdBy: context.user.id }
    )
  ).filter((application) => canSee(application, viewerOf(context)))
  const types = await listProjectTypes(db, context.hoa.id)
  return Promise.all(
    applications.map(async (application) => {
      const [latest] = await listReviewSummaries(db, context.hoa.id, application.id)
      return {
        ...application,
        recommendation: latest?.recommendation ?? null,
        projectTypeLabel: typeLabel(types, application.projectTypeId)
      }
    })
  )
})

/** The rules file a review read, checked against the hash it recorded. */
const reviewRulesFile = (hoaId: string, review: Review) =>
  readRulesFileForDisplay({
    fileKey: rulebookKeys(hoaId, review.rulebookId).file,
    fileSha256: review.rulesFileSha256
  })

/** What identification read to name each entity (the plat route, the photo), from the review's subjects step. */
export type EntityEvidence = { entity: string; evidence: T.Evidence[] }

const subjectsStep = z.object({ answer: subjectsAnswerSchema })

/**
 * The evidence that named each entity. The review record doesn't keep it, so it's read from the job's stored subjects
 * step; a review whose steps are gone shows its entities without it.
 */
async function loadEntityEvidence(hoaId: string, review: Review): Promise<EntityEvidence[]> {
  try {
    const step = await getJson(getBucket(), jobStepKey(hoaId, review.jobId, "subjects"), subjectsStep)
    return (step?.answer.entities ?? []).map((entity) => ({
      entity: entity.id,
      evidence: entity.evidence.map(toEvidence)
    }))
  } catch (error) {
    console.error(error)
    return []
  }
}

/** The governing documents with pages, which the cited provisions' anchors point into. */
async function loadSourceFiles(hoaId: string): Promise<SourceFile[]> {
  const uploads = await listGoverningDocuments(getDb(), hoaId)
  return uploads.flatMap((upload) =>
    upload.status === "ready" && upload.pageCount
      ? [{ id: upload.id, title: upload.title, pageCount: upload.pageCount }]
      : []
  )
}

export type ApplicationView = {
  application: Application
  files: ApplicationFile[]
  /** The latest review; for the committee, the review fixed at submission. */
  review: Review | null
  /** The rules the review considered, with the provisions they cite. */
  rules: ReportRule[]
  /** The rulebook's terms the review names, for labels and term chips. */
  terms: T.Term[]
  entityEvidence: EntityEvidence[]
  /** The governing documents a citation can be shown on. */
  sourceFiles: SourceFile[]
  /** The project type's label; null for "Something else". */
  projectTypeLabel: string | null
  /**
   * The project type, for its form: as homeowners fill it in now while the homeowner can change the answers, otherwise
   * as stored. Null for "Something else" or a type that's gone.
   */
  projectType: OfferedProjectType | null
  history: Pick<ReviewSummary, "id" | "recommendation" | "createdAt">[]
  /** The latest review job, so the page can follow one in progress or show why it failed. */
  job: Job | null
  isOwner: boolean
  canEdit: boolean
  canDecide: boolean
}

export const getApplicationView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ applicationId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<ApplicationView> => {
    const context = await getRequestContext()
    const application = await loadApplication(context, data.applicationId)
    const db = getDb()
    const isOwner = application.createdBy === context.user.id
    const isCommittee = context.role === "administrator" && !isOwner
    const reviewId = isCommittee && application.submittedReviewId ? application.submittedReviewId : application.reviewId
    const canEdit = isOwner && editableStatuses.includes(application.status)
    const [files, review, history, job, sourceFiles, type] = await Promise.all([
      listApplicationFiles(db, context.hoa.id, application.id),
      loadReview(context.hoa.id, application.id, reviewId),
      listReviewSummaries(db, context.hoa.id, application.id),
      getLatestJob(db, context.hoa.id, application.id),
      loadSourceFiles(context.hoa.id),
      application.projectTypeId ? getProjectType(db, context.hoa.id, application.projectTypeId) : null
    ])
    const [rulesFile, entityEvidence, published] = await Promise.all([
      review ? reviewRulesFile(context.hoa.id, review) : null,
      review ? loadEntityEvidence(context.hoa.id, review) : [],
      canEdit && type ? loadPublishedRules(context.hoa.id) : null
    ])
    const rules = review && rulesFile ? reportRules(rulesFile, review.selected) : []
    return {
      application,
      files,
      review,
      rules,
      terms: review && rulesFile ? reviewTerms(rulesFile, review, rules) : [],
      entityEvidence,
      sourceFiles,
      projectTypeLabel: type?.label ?? null,
      projectType: type ? offerType(type, published, today()) : null,
      history: history.map(({ id, recommendation, createdAt }) => ({ id, recommendation, createdAt })),
      job,
      isOwner,
      canEdit,
      canDecide: context.role === "administrator" && application.status === "submitted"
    }
  })

/**
 * A photo from the packet, for the thumbnails beside the facts read from it: a short-lived download URL, or the image
 * inline where the environment has no R2 token to sign one.
 */
export const getPacketImage = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ applicationId: z.string(), fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const application = await loadApplication(context, data.applicationId)
    const file = await getApplicationFile(getDb(), context.hoa.id, data.fileId)
    if (file?.applicationId !== application.id || !file.mediaType.startsWith("image/")) {
      throw new Error("That file isn't a photo in this application.")
    }
    const key = applicationKeys(context.hoa.id, application.id).source(file.id, file.fileName)
    const presigner = presignerOrNull()
    if (presigner) {
      return { url: await presigner.download(key) }
    }
    const object = await getBucket().get(key)
    if (!object) {
      throw new Error("The photo is missing from storage.")
    }
    return { url: `data:${file.mediaType};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}` }
  })
