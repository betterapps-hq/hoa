import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm"
import { z } from "zod"
import {
  applicationFileSchema,
  applicationSchema,
  type Application,
  type ApplicationFile,
  type ApplicationStatus
} from "@/applications/application"
import { recommendations, type Recommendation } from "@/review/reviewModel"
import type { ApplicationFileKind } from "@/rules/catalog"
import type { Database } from "./database"
import { applicationFiles, applicationPages, applications, reviews } from "./schema"

export async function createApplication(
  db: Database,
  input: Pick<Application, "hoaId" | "projectType" | "description" | "createdBy"> & { now: string; deleteAfter: string }
): Promise<Application> {
  const application: Application = {
    id: crypto.randomUUID(),
    hoaId: input.hoaId,
    projectType: input.projectType,
    description: input.description,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
    status: "draft",
    reviewId: null,
    submittedReviewId: null,
    submittedAt: null,
    decision: null,
    deleteAfter: input.deleteAfter
  }
  await db.insert(applications).values(application)
  return application
}

export async function getApplication(db: Database, hoaId: string, id: string): Promise<Application | null> {
  const row = await db
    .select()
    .from(applications)
    .where(and(eq(applications.hoaId, hoaId), eq(applications.id, id)))
    .get()
  return row ? applicationSchema.parse(row) : null
}

/** A homeowner's own applications, or every application for an administrator, newest first. */
export async function listApplications(
  db: Database,
  hoaId: string,
  filter: { createdBy?: string; statuses?: readonly ApplicationStatus[] } = {}
): Promise<Application[]> {
  const conditions = [eq(applications.hoaId, hoaId)]
  if (filter.createdBy) {
    conditions.push(eq(applications.createdBy, filter.createdBy))
  }
  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(applications.status, [...filter.statuses]))
  }
  const rows = await db
    .select()
    .from(applications)
    .where(and(...conditions))
    .orderBy(desc(applications.updatedAt))
  return rows.map((row) => applicationSchema.parse(row))
}

export type ApplicationPatch = Partial<
  Pick<
    Application,
    | "description"
    | "status"
    | "reviewId"
    | "submittedReviewId"
    | "submittedAt"
    | "decision"
    | "deleteAfter"
    | "updatedAt"
  >
>

/**
 * Updates an application only while it's in one of `from`, so a double click or a retried request can't apply a
 * transition twice. Returns the query for batching with a job insert; `applied` tells whether it changed a row.
 */
export function transitionApplication(
  db: Database,
  hoaId: string,
  id: string,
  from: readonly ApplicationStatus[],
  patch: ApplicationPatch
) {
  return db
    .update(applications)
    .set(patch)
    .where(and(eq(applications.hoaId, hoaId), eq(applications.id, id), inArray(applications.status, [...from])))
    .returning({ id: applications.id })
}

export async function updateApplication(db: Database, hoaId: string, id: string, patch: ApplicationPatch) {
  await db
    .update(applications)
    .set(patch)
    .where(and(eq(applications.hoaId, hoaId), eq(applications.id, id)))
}

/** Applications whose retention has passed, for the daily sweep. */
export async function listExpiredApplications(db: Database, now: string) {
  const rows = await db
    .select()
    .from(applications)
    .where(and(isNotNull(applications.deleteAfter), lte(applications.deleteAfter, now)))
  return rows.map((row) => applicationSchema.parse(row))
}

export async function deleteApplication(db: Database, hoaId: string, id: string) {
  const files = await db
    .select({ id: applicationFiles.id })
    .from(applicationFiles)
    .where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.applicationId, id)))
  const fileIds = files.map((file) => file.id)
  await db.batch([
    db
      .delete(applicationPages)
      .where(and(eq(applicationPages.hoaId, hoaId), inArray(applicationPages.fileId, fileIds))),
    db.delete(applicationFiles).where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.applicationId, id))),
    db.delete(reviews).where(and(eq(reviews.hoaId, hoaId), eq(reviews.applicationId, id))),
    db.delete(applications).where(and(eq(applications.hoaId, hoaId), eq(applications.id, id)))
  ])
}

export async function createApplicationFile(
  db: Database,
  input: Pick<ApplicationFile, "hoaId" | "applicationId" | "fileName" | "mediaType" | "sizeBytes"> &
    Partial<Pick<ApplicationFile, "id" | "parentFileId" | "ordinal" | "contextText" | "status">> & { now: string }
): Promise<ApplicationFile> {
  const file: ApplicationFile = {
    id: input.id ?? crypto.randomUUID(),
    hoaId: input.hoaId,
    applicationId: input.applicationId,
    parentFileId: input.parentFileId ?? null,
    ordinal: input.ordinal ?? null,
    contextText: input.contextText ?? null,
    fileName: input.fileName,
    mediaType: input.mediaType,
    sizeBytes: input.sizeBytes,
    sha256: null,
    pageCount: null,
    kind: null,
    status: input.status ?? "uploading",
    error: null,
    createdAt: input.now
  }
  await db.insert(applicationFiles).values(file).onConflictDoNothing()
  return file
}

export async function getApplicationFile(db: Database, hoaId: string, id: string): Promise<ApplicationFile | null> {
  const row = await db
    .select()
    .from(applicationFiles)
    .where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.id, id)))
    .get()
  return row ? applicationFileSchema.parse(row) : null
}

export async function listApplicationFiles(
  db: Database,
  hoaId: string,
  applicationId: string
): Promise<ApplicationFile[]> {
  const rows = await db
    .select()
    .from(applicationFiles)
    .where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.applicationId, applicationId)))
  return rows
    .map((row) => applicationFileSchema.parse(row))
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.ordinal ?? 0) - (b.ordinal ?? 0))
}

export async function updateApplicationFile(
  db: Database,
  hoaId: string,
  id: string,
  patch: Partial<Pick<ApplicationFile, "status" | "error" | "sha256" | "pageCount" | "kind">>
) {
  await db
    .update(applicationFiles)
    .set(patch)
    .where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.id, id)))
}

/** Removes a file and anything derived from it (pictures extracted from a Word file). */
export async function deleteApplicationFile(db: Database, hoaId: string, id: string) {
  const children = await db
    .select({ id: applicationFiles.id })
    .from(applicationFiles)
    .where(and(eq(applicationFiles.hoaId, hoaId), eq(applicationFiles.parentFileId, id)))
  const ids = [id, ...children.map((child) => child.id)]
  await db.batch([
    db.delete(applicationPages).where(and(eq(applicationPages.hoaId, hoaId), inArray(applicationPages.fileId, ids))),
    db.delete(applicationFiles).where(and(eq(applicationFiles.hoaId, hoaId), inArray(applicationFiles.id, ids)))
  ])
  return ids
}

/** Page kinds from classification, written as a whole per file. */
export async function setPageKinds(db: Database, hoaId: string, fileId: string, kinds: readonly ApplicationFileKind[]) {
  await db.batch([
    db.delete(applicationPages).where(and(eq(applicationPages.hoaId, hoaId), eq(applicationPages.fileId, fileId))),
    ...kinds.map((kind, index) => db.insert(applicationPages).values({ hoaId, fileId, pageIndex: index + 1, kind }))
  ])
}

export async function listPageKinds(db: Database, hoaId: string, fileIds: readonly string[]) {
  if (fileIds.length === 0) {
    return []
  }
  return db
    .select({ fileId: applicationPages.fileId, pageIndex: applicationPages.pageIndex, kind: applicationPages.kind })
    .from(applicationPages)
    .where(and(eq(applicationPages.hoaId, hoaId), inArray(applicationPages.fileId, [...fileIds])))
}

export type ReviewSummary = {
  id: string
  hoaId: string
  applicationId: string
  jobId: string
  rulebookId: string
  recommendation: Recommendation
  costUsd: number
  sessionId: string
  createdAt: string
}

/** The D1 row for a review; the full record is in R2. Upserted so a retried step writes it once. */
export async function saveReviewSummary(db: Database, summary: ReviewSummary) {
  await db.insert(reviews).values(summary).onConflictDoNothing()
}

export async function listReviewSummaries(
  db: Database,
  hoaId: string,
  applicationId: string
): Promise<ReviewSummary[]> {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.hoaId, hoaId), eq(reviews.applicationId, applicationId)))
    .orderBy(desc(reviews.createdAt))
  return rows.map((row) => ({ ...row, recommendation: z.enum(recommendations).parse(row.recommendation) }))
}
