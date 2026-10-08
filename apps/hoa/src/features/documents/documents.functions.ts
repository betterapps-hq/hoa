import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import {
  createGoverningDocument,
  getGoverningDocument,
  listGoverningDocuments,
  updateGoverningDocument
} from "@/db/documentRepository"
import { getJob, getLatestJob, insertJob, newJob } from "@/db/jobRepository"
import { governingDocumentKinds } from "@/documents/governingDocument"
import { requireAdministrator, getRequestContext } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { getBucket, getPresigner } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"

// Governing documents: upload, OCR at upload, and job progress (docs/design/platform.md, "Server functions").

const createUploadInput = z.object({
  fileName: z.string().min(1),
  mediaType: z.string(),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(governingDocumentKinds),
  title: z.string().trim().min(1, "Enter a title."),
  effectiveDate: z.string().nullable(),
  lineageId: z.string().nullable(),
  amends: z.string().nullable()
})

export type CreateUploadResult = {
  documentId: string
  /** A presigned PUT URL, or null when the environment uploads through `uploadDocumentFile`. */
  uploadUrl: string | null
  contentType: string
}

function presignerOrNull() {
  try {
    return getPresigner()
  } catch {
    return null
  }
}

/** Records a governing document and returns where to upload it. */
export const createDocumentUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) => createUploadInput.parse(data))
  .handler(async ({ data }): Promise<CreateUploadResult> => {
    const context = await requireAdministrator()
    const validation = validateUpload({ name: data.fileName, type: data.mediaType, size: data.sizeBytes }, "governing")
    if (!validation.isValid) {
      throw new Error(validation.message)
    }
    const document = await createGoverningDocument(getDb(), {
      hoaId: context.hoa.id,
      kind: data.kind,
      title: data.title,
      effectiveDate: data.effectiveDate,
      fileName: data.fileName,
      mediaType: validation.upload.mediaType,
      sizeBytes: data.sizeBytes,
      uploadedBy: context.user.id,
      uploadedAt: new Date().toISOString(),
      ...(data.lineageId ? { lineageId: data.lineageId } : {}),
      amends: data.amends
    })
    const key = governingKeys(context.hoa.id, document.id).source(document.fileName)
    const presigner = presignerOrNull()
    return {
      documentId: document.id,
      uploadUrl: presigner ? await presigner.upload(key) : null,
      contentType: document.mediaType
    }
  })

/** Uploads through the Worker when the environment has no R2 API token for presigned URLs. */
export const uploadDocumentFile = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data.")
    }
    const documentId = data.get("documentId")
    const file = data.get("file")
    if (typeof documentId !== "string" || !(file instanceof File)) {
      throw new Error("Expected a document id and a file.")
    }
    return { documentId, file }
  })
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const document = await getGoverningDocument(getDb(), context.hoa.id, data.documentId)
    if (document?.status !== "uploading") {
      throw new Error("This upload has already been completed.")
    }
    const key = governingKeys(context.hoa.id, document.id).source(document.fileName)
    await getBucket().put(key, data.file, { httpMetadata: { contentType: document.mediaType } })
  })

/** Confirms the file is in storage and starts DocumentIngest; a repeated call starts nothing new. */
export const completeDocumentUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ documentId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const document = await getGoverningDocument(db, context.hoa.id, data.documentId)
    if (!document) {
      throw new Error("The document doesn't exist.")
    }
    if (document.status !== "uploading") {
      return { jobId: (await getLatestJob(db, context.hoa.id, document.id))?.id ?? null }
    }
    const key = governingKeys(context.hoa.id, document.id).source(document.fileName)
    const object = await getBucket().head(key)
    if (!object || object.size !== document.sizeBytes) {
      throw new Error("The upload didn't finish. Try again.")
    }
    const now = new Date().toISOString()
    const job = newJob({ hoaId: context.hoa.id, kind: "document-ingest", subjectId: document.id, now })
    await db.batch([insertJob(db, job)])
    await updateGoverningDocument(db, context.hoa.id, document.id, { status: "processing" })
    try {
      await bindings.DOCUMENT_INGEST.create({
        id: job.id,
        params: { hoaId: context.hoa.id, documentId: document.id, jobId: job.id }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The document couldn't be processed."
      await updateGoverningDocument(db, context.hoa.id, document.id, {
        status: "failed",
        error: { stage: "start", message, isRetryable: true }
      })
      throw error
    }
    return { jobId: job.id }
  })

export const listDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getRequestContext()
  return listGoverningDocuments(getDb(), context.hoa.id)
})

export const getJobStatus = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ jobId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    return getJob(getDb(), context.hoa.id, data.jobId)
  })

/** The latest job for a document, rulebook or application, so a reloaded page finds work in progress. */
export const getActiveJob = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ subjectId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    return getLatestJob(getDb(), context.hoa.id, data.subjectId)
  })
