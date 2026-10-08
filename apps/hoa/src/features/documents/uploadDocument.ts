import type { GoverningDocumentKind } from "@/documents/governingDocument"
import type { CreateUploadResult } from "./documents.functions"

export type DocumentDetails = {
  kind: GoverningDocumentKind
  title: string
  effectiveDate: string | null
}

export type UploadApi = {
  createUpload: (input: {
    fileName: string
    mediaType: string
    sizeBytes: number
    kind: GoverningDocumentKind
    title: string
    effectiveDate: string | null
    lineageId: string | null
    amends: string | null
  }) => Promise<CreateUploadResult>
  uploadThroughServer: (form: FormData) => Promise<void>
  completeUpload: (documentId: string) => Promise<{ jobId: string | null }>
  fetch?: typeof fetch
}

/**
 * Uploads a governing document: straight to R2 with a presigned URL when the environment has one, otherwise through
 * the server; then starts OCR. Returns the document and the job to follow.
 */
export async function uploadDocument(api: UploadApi, file: File, details: DocumentDetails) {
  const created = await api.createUpload({
    fileName: file.name,
    mediaType: file.type,
    sizeBytes: file.size,
    ...details,
    lineageId: null,
    amends: null
  })
  if (created.uploadUrl) {
    const response = await (api.fetch ?? fetch)(created.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": created.contentType },
      body: file
    })
    if (!response.ok) {
      throw new Error(`The upload failed (${response.status}). Try again.`)
    }
  } else {
    const form = new FormData()
    form.set("documentId", created.documentId)
    form.set("file", file)
    await api.uploadThroughServer(form)
  }
  const { jobId } = await api.completeUpload(created.documentId)
  return { documentId: created.documentId, jobId }
}
