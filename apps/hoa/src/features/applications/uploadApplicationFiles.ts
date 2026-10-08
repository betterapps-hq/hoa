import { validateUpload } from "@/storage/uploadRules"
import type { CreateFileUploadResult } from "./applications.functions"

export type ApplicationUploadApi = {
  createUpload: (input: {
    applicationId: string
    fileName: string
    mediaType: string
    sizeBytes: number
  }) => Promise<CreateFileUploadResult>
  uploadThroughServer: (form: FormData) => Promise<void>
  completeUpload: (fileId: string) => Promise<void>
  fetch?: typeof fetch
}

/** The first file that can't be uploaded, with what to do instead; null when every file is fine. */
export function uploadProblem(files: readonly File[]) {
  for (const file of files) {
    const validation = validateUpload({ name: file.name, type: file.type, size: file.size }, "application")
    if (!validation.isValid) {
      return validation.message
    }
  }
  return null
}

/**
 * Uploads application files one after another: straight to R2 with a presigned URL when the environment has one,
 * otherwise through the server. The files are read when the review runs.
 */
export async function uploadApplicationFiles(api: ApplicationUploadApi, applicationId: string, files: readonly File[]) {
  const problem = uploadProblem(files)
  if (problem) {
    throw new Error(problem)
  }
  for (const file of files) {
    const created = await api.createUpload({
      applicationId,
      fileName: file.name,
      mediaType: file.type,
      sizeBytes: file.size
    })
    if (created.uploadUrl) {
      const response = await (api.fetch ?? fetch)(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": created.contentType },
        body: file
      })
      if (!response.ok) {
        throw new Error(`${file.name} didn't upload (${response.status}). Try again.`)
      }
    } else {
      const form = new FormData()
      form.set("fileId", created.fileId)
      form.set("file", file)
      await api.uploadThroughServer(form)
    }
    await api.completeUpload(created.fileId)
  }
}
