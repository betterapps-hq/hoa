import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import {
  createGoverningDocument,
  getGoverningDocument,
  listDocumentRecords,
  listGoverningDocuments,
  listProvisions,
  updateGoverningDocument
} from "@/db/documentRepository"
import { getJob, getLatestJob, insertJob, newJob } from "@/db/jobRepository"
import { governingDocumentKinds, type GoverningDocument } from "@/documents/governingDocument"
import { pageGeometry, toTuples, type WordTuple } from "@/documents/pageGeometry"
import { documentReading, type DocumentReading } from "@/documents/reading"
import { analyzeResultOf } from "@/ocr/layoutClient"
import { layoutResultSchema } from "@/ocr/layoutResult"
import { pageSchema } from "@/ocr/page"
import { requireAdministrator, getRequestContext } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { getJson } from "@/storage/objects"
import { loadPages } from "@/storage/pages"
import { getBucket, getPresigner } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"
import { removeDocument } from "./removeDocument"

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
    // A new edition joins one of this organization's documents, and an amendment amends one of them.
    const uploads = data.lineageId || data.amends ? await listGoverningDocuments(getDb(), context.hoa.id) : []
    if (data.lineageId && !uploads.some((upload) => upload.lineageId === data.lineageId)) {
      throw new Error("The document this is a new edition of doesn't exist.")
    }
    if (data.amends && !uploads.some((upload) => upload.id === data.amends)) {
      throw new Error("The document this amends doesn't exist.")
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

/** Removes a governing document, every version of it, from the documents builds read. Administrators only. */
export const removeGoverningDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ documentId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await removeDocument(getDb(), await getRequestContext(), data.documentId, new Date().toISOString())
  })

export const listDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getRequestContext()
  return listGoverningDocuments(getDb(), context.hoa.id)
})

export type DocumentPage = {
  documentId: string
  title: string
  pageCount: number
  pageIndex: number
  pageLabel: string | null
  /** The page's text exactly as stored; citations are character ranges into it. */
  text: string
}

/** One page of a governing document, for the document viewer that shows a citation. */
export const getDocumentPage = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ documentId: z.string(), pageIndex: z.number().int().positive() }).parse(data)
  )
  .handler(async ({ data }): Promise<DocumentPage> => {
    const context = await getRequestContext()
    const document = await getGoverningDocument(getDb(), context.hoa.id, data.documentId)
    if (document?.status !== "ready" || !document.pageCount) {
      throw new Error("That document isn't ready.")
    }
    const pageIndex = Math.min(data.pageIndex, document.pageCount)
    const page = await getJson(getBucket(), governingKeys(context.hoa.id, document.id).page(pageIndex), pageSchema)
    if (!page) {
      throw new Error(`Page ${pageIndex} of ${document.title} is missing.`)
    }
    return {
      documentId: document.id,
      title: document.title,
      pageCount: document.pageCount,
      pageIndex,
      pageLabel: page.pageLabel,
      text: page.text
    }
  })

/** The page ranges the OCR read a PDF in: `1-50`, `51-100`, as stored at ingest. */
const ocrRangeOf = (page: number) => {
  const start = Math.floor((page - 1) / 50) * 50 + 1
  return `${start}-${start + 49}`
}

/**
 * A governing document to read whole (encoding.md, UX, Reading): its provisions in reading order with the page text
 * outside them, or its pages' text before a build has structured it. Every member of the organization may read its
 * governing documents; the upload is looked up in the requester's organization only.
 */
export const getDocumentReading = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ documentId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<DocumentReading> => {
    const context = await getRequestContext()
    const db = getDb()
    const hoaId = context.hoa.id
    const [found, records, uploads] = await Promise.all([
      getGoverningDocument(db, hoaId, data.documentId),
      listDocumentRecords(db, hoaId),
      listGoverningDocuments(db, hoaId)
    ])
    const provisions = await listProvisions(
      db,
      hoaId,
      records.map((item) => item.id)
    )
    const isReadable = (item: GoverningDocument | undefined | null): item is GoverningDocument =>
      item?.status === "ready" && Boolean(item.pageCount)
    // A document asked for by its key or its record (a citation without pages names it so) reads from the upload its
    // provisions were read from, when there is one.
    const record = isReadable(found)
      ? undefined
      : records.find((item) => item.id === data.documentId || item.document.key === data.documentId)
    const own = record ? provisions.filter((provision) => provision.key.startsWith(`${record.document.key}:`)) : []
    const anchoredId = own.flatMap((provision) => provision.anchors)[0]?.fileId
    const upload = isReadable(found) ? found : uploads.find((item) => item.id === anchoredId && isReadable(item))
    if (!isReadable(upload)) {
      // A document whose text came from a rules file has provisions but no pages.
      if (!record || own.length === 0) {
        throw new Error("That document isn't ready to read.")
      }
      return documentReading({
        upload: { id: record.id, title: record.document.title, version: 1, effectiveDate: null, pageCount: 0 },
        records: [record.document],
        provisions,
        pages: new Map(),
        fileTitles: new Map(),
        newerVersionId: null,
        original: null
      })
    }
    // The documents the upload holds: its own record, the one whose edition lists it (an amendment's), and those whose
    // provisions were read from its pages (an exhibit that's a document of its own), in the order its pages hold them.
    const firstPage = (key: string) =>
      Math.min(
        ...provisions.flatMap((provision) =>
          provision.key.startsWith(`${key}:`)
            ? provision.anchors.filter((anchor) => anchor.fileId === upload.id).map((anchor) => anchor.page)
            : []
        )
      )
    const held = records
      .filter(
        (item) =>
          item.id === upload.id ||
          item.document.edition?.files.some((file) => file.fileId === upload.id) ||
          Number.isFinite(firstPage(item.document.key))
      )
      // The upload's own record first, then the others in the order its pages hold them.
      .toSorted(
        (a, b) =>
          Number(b.id === upload.id) - Number(a.id === upload.id) ||
          firstPage(a.document.key) - firstPage(b.document.key)
      )
      // One record per document key: provision keys start with it, so two records with a key would repeat the text.
      .filter((item, index, all) => all.findIndex((other) => other.document.key === item.document.key) === index)
    const heldKeys = held.map((item) => `${item.document.key}:`)
    const fileIds = new Set([
      upload.id,
      ...provisions
        .filter((provision) => heldKeys.some((key) => provision.key.startsWith(key)))
        .flatMap((provision) => provision.anchors.map((anchor) => anchor.fileId))
    ])
    const bucket = getBucket()
    const files = uploads.filter((item) => fileIds.has(item.id) && item.status === "ready" && item.pageCount)
    const pages = new Map(
      await Promise.all(
        files.map(
          async (file) =>
            [file.id, await loadPages(bucket, governingKeys(hoaId, file.id), file.pageCount ?? 0)] as const
        )
      )
    )
    // The PDF shows beside the text; its words can be marked when Layout's results were kept at ingest.
    const uploadKeys = governingKeys(hoaId, upload.id)
    const [source, firstOcr] =
      upload.mediaType === "application/pdf"
        ? await Promise.all([
            bucket.head(uploadKeys.source(upload.fileName)),
            bucket.head(uploadKeys.ocr("azure-layout", ocrRangeOf(1)))
          ])
        : [null, null]
    const original = source && source.size > 0 ? { hasWordBoxes: firstOcr !== null } : null
    const newer = uploads
      .filter((item) => item.lineageId === upload.lineageId && item.version > upload.version && item.status === "ready")
      .toSorted((a, b) => b.version - a.version)[0]
    return documentReading({
      upload,
      records: held.map((item) => item.document),
      provisions,
      pages,
      fileTitles: new Map(files.map((file) => [file.id, file.title])),
      newerVersionId: newer?.id ?? null,
      original
    })
  })

export type GeometryPage = { page: number; width: number; height: number; words: WordTuple[] }

/**
 * Where the words of some pages of a governing document's PDF are (encoding.md, UX, Reading): each page's size and its
 * words' boxes, aligned to the page text citations index, so the reader draws highlights on the original. Read from
 * the OCR results stored at ingest, for the requester's organization only; pages without them are left out.
 */
export const getPageGeometry = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({ documentId: z.string(), from: z.number().int().positive(), to: z.number().int().positive() })
      .refine((range) => range.to >= range.from && range.to - range.from < 25, "Ask for up to 25 pages at a time.")
      .parse(data)
  )
  .handler(async ({ data }): Promise<GeometryPage[]> => {
    const context = await getRequestContext()
    const upload = await getGoverningDocument(getDb(), context.hoa.id, data.documentId)
    if (upload?.status !== "ready" || !upload.pageCount || upload.mediaType !== "application/pdf") {
      throw new Error("That document has no pages to show.")
    }
    const keys = governingKeys(context.hoa.id, upload.id)
    const bucket = getBucket()
    const wanted = Array.from(
      { length: Math.min(data.to, upload.pageCount) - data.from + 1 },
      (_, index) => data.from + index
    )
    const ranges = [...new Set(wanted.map(ocrRangeOf))]
    const layouts = await Promise.all(
      ranges.map(async (range) => {
        const object = await bucket.get(keys.ocr("azure-layout", range))
        return object ? layoutResultSchema.parse(analyzeResultOf(await object.text())) : null
      })
    )
    const layoutPages = new Map(
      layouts.flatMap((layout) => layout?.pages ?? []).map((page) => [page.pageNumber, page] as const)
    )
    const results = await Promise.all(
      wanted.map(async (pageIndex) => {
        const layoutPage = layoutPages.get(pageIndex)
        const page = layoutPage ? await getJson(bucket, keys.page(pageIndex), pageSchema) : null
        const geometry = page && layoutPage ? pageGeometry(page.text, layoutPage) : null
        return geometry ? [{ ...geometry, words: toTuples(geometry.words) }] : []
      })
    )
    return results.flat()
  })

/** Where a cited provision is read, for stepping through a rule's citations across documents. */
export type ProvisionLocation = { documentId: string; heading: string | null }

/** The upload each provision is read in, and how it's named; provisions the organization doesn't have are left out. */
export const locateProvisions = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ keys: z.array(z.string()).max(200) }).parse(data))
  .handler(async ({ data }): Promise<Record<string, ProvisionLocation>> => {
    const context = await getRequestContext()
    const db = getDb()
    const records = await listDocumentRecords(db, context.hoa.id)
    const wanted = new Set(data.keys)
    const provisions = (
      await listProvisions(
        db,
        context.hoa.id,
        records.map((record) => record.id)
      )
    ).filter((provision) => wanted.has(provision.key))
    return Object.fromEntries(
      provisions.flatMap((provision) => {
        const record = records.find((item) => provision.key.startsWith(`${item.document.key}:`))
        const documentId = provision.anchors[0]?.fileId ?? record?.document.key
        return documentId ? [[provision.key, { documentId, heading: provision.heading }]] : []
      })
    )
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
