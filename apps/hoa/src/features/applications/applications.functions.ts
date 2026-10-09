import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import {
  decisionOutcomes,
  deleteAfterFor,
  type Application,
  type ApplicationFile,
  type ApplicationStatus
} from "@/applications/application"
import {
  createApplication as createApplicationRecord,
  createApplicationFile,
  deleteApplicationFile,
  getApplication,
  getApplicationFile,
  listApplicationFiles,
  listApplications as listApplicationRecords,
  listReviewSummaries,
  transitionApplication,
  updateApplicationFile,
  type ReviewSummary
} from "@/db/applicationRepository"
import { getDb } from "@/db/client.server"
import { listGoverningDocuments } from "@/db/documentRepository"
import { getLatestJob, insertJob, newJob } from "@/db/jobRepository"
import { getPublishedRulesFile, type RulesFileRef } from "@/db/rulebookContentRepository"
import type { Job } from "@/jobs/job"
import { toEvidence } from "@/review/factSchema"
import { hasOpenRequests, reviewSchema, type Recommendation, type Review } from "@/review/reviewModel"
import { subjectsAnswerSchema } from "@/review/subjects"
import { readRulesFile } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import { getRequestContext, requireAdministrator, type RequestContext } from "@/session/requestContext.server"
import { applicationKeys, jobStepKey, rulebookKeys } from "@/storage/keys"
import { getJson, toBase64 } from "@/storage/objects"
import { getBucket, getPresigner } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"
import type { SourceFile } from "../rulebook/rulebook.functions"
import {
  projectKindOptions,
  reportRules,
  reviewTerms,
  type ProjectKindOption,
  type ReportRule
} from "./applicationView"

// Applications (docs/design/platform.md, "Server functions"): the homeowner creates one, uploads the packet, runs the
// review as often as they like and submits; the committee decides.

/** Statuses in which the homeowner can change files and run the review. */
const editableStatuses: readonly ApplicationStatus[] = ["draft", "reviewed", "information-requested"]

function presignerOrNull() {
  try {
    return getPresigner()
  } catch {
    return null
  }
}

/** The application, if the requester may see it: its owner, or an administrator. */
async function loadApplication(context: RequestContext, applicationId: string) {
  const application = await getApplication(getDb(), context.hoa.id, applicationId)
  if (!application || (context.role !== "administrator" && application.createdBy !== context.user.id)) {
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

export const createApplication = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        projectKind: z.string().nullable(),
        description: z.string().trim().max(4000).nullable()
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<Application> => {
    const context = await getRequestContext()
    const now = new Date().toISOString()
    return createApplicationRecord(getDb(), {
      hoaId: context.hoa.id,
      projectKind: data.projectKind,
      description: data.description || null,
      createdBy: context.user.id,
      now,
      deleteAfter:
        deleteAfterFor({ status: "draft", updatedAt: now, decision: null, submittedAt: null }, context.hoa.settings) ??
        now
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
        sizeBytes: z.number().int().positive()
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
    const file = await createApplicationFile(getDb(), {
      hoaId: context.hoa.id,
      applicationId: application.id,
      fileName: data.fileName,
      mediaType: validation.upload.mediaType,
      sizeBytes: data.sizeBytes,
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

/** Removes a file, and any pictures taken from it, before the next review. */
export const removeApplicationFile = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const record = await getApplicationFile(getDb(), context.hoa.id, data.fileId)
    if (!record || record.parentFileId) {
      throw new Error("The file can't be removed.")
    }
    await loadEditable(context, record.applicationId)
    await deleteApplicationFile(getDb(), context.hoa.id, record.id)
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
  /** The project kind's label in the published rulebook; null for "Something else". */
  projectKindLabel: string | null
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

/** The published rules file, or null before the HOA publishes one. */
async function loadPublishedRulesFile(hoaId: string) {
  const published = await getPublishedRulesFile(getDb(), hoaId)
  return published ? readRulesFileForDisplay(published) : null
}

const kindLabel = (kinds: readonly ProjectKindOption[], key: string | null) =>
  key === null ? null : (kinds.find((kind) => kind.key === key)?.label ?? key)

/** A homeowner's own applications, or every application for the committee, with their latest recommendation. */
export const listApplications = createServerFn({ method: "GET" }).handler(async (): Promise<ApplicationListItem[]> => {
  const context = await getRequestContext()
  const db = getDb()
  const applications = await listApplicationRecords(
    db,
    context.hoa.id,
    context.role === "administrator" ? {} : { createdBy: context.user.id }
  )
  const published = await loadPublishedRulesFile(context.hoa.id)
  const kinds = published ? projectKindOptions(published) : []
  return Promise.all(
    applications.map(async (application) => {
      const [latest] = await listReviewSummaries(db, context.hoa.id, application.id)
      return {
        ...application,
        recommendation: latest?.recommendation ?? null,
        projectKindLabel: kindLabel(kinds, application.projectKind)
      }
    })
  )
})

/** The published rulebook's project kinds, for the homeowner's picker; none until a rulebook is published. */
export const listProjectKinds = createServerFn({ method: "GET" }).handler(async (): Promise<ProjectKindOption[]> => {
  const context = await getRequestContext()
  const published = await loadPublishedRulesFile(context.hoa.id)
  return published ? projectKindOptions(published) : []
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
  /** The project kind's label in the rulebook; null for "Something else". */
  projectKindLabel: string | null
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
    const [files, review, history, job, sourceFiles] = await Promise.all([
      listApplicationFiles(db, context.hoa.id, application.id),
      loadReview(context.hoa.id, application.id, reviewId),
      listReviewSummaries(db, context.hoa.id, application.id),
      getLatestJob(db, context.hoa.id, application.id),
      loadSourceFiles(context.hoa.id)
    ])
    const [rulesFile, entityEvidence] = await Promise.all([
      review ? reviewRulesFile(context.hoa.id, review) : loadPublishedRulesFile(context.hoa.id),
      review ? loadEntityEvidence(context.hoa.id, review) : []
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
      projectKindLabel: kindLabel(rulesFile ? projectKindOptions(rulesFile) : [], application.projectKind),
      history: history.map(({ id, recommendation, createdAt }) => ({ id, recommendation, createdAt })),
      job,
      isOwner,
      canEdit: isOwner && editableStatuses.includes(application.status),
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
