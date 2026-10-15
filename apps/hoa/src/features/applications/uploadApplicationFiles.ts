import type { UploadAdapter } from "@uploadcn/core"
import { serverUploadAdapter } from "@/storage/serverUpload"
import type { CreateFileUploadResult } from "./applications.functions"

// An application's files (documents.md, Uploads): each is recorded, sent (src/storage/serverUpload.ts) and completed;
// the review reads them when it runs.

export type ApplicationUploadApi = {
  createUpload: (input: {
    applicationId: string
    fileName: string
    mediaType: string
    sizeBytes: number
    /** What the homeowner says it is: one of the project type's documents, or other (src/applications/uploadedAs.ts). */
    uploadedAs?: string
  }) => Promise<CreateFileUploadResult>
  uploadThroughServer: (form: FormData) => Promise<void>
  completeUpload: (fileId: string) => Promise<void>
}

/** Where an application's files go; `uploadedAs` says what a file is when that's clear from it. */
export function applicationAdapter(
  api: ApplicationUploadApi,
  applicationId: string,
  uploadedAs: (file: File) => string | null = () => null
): UploadAdapter<{ fileId: string }> {
  return serverUploadAdapter({
    name: "application",
    start: (file) => {
      const kind = uploadedAs(file)
      return api.createUpload({
        applicationId,
        fileName: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
        ...(kind ? { uploadedAs: kind } : {})
      })
    },
    throughServer: async (started, file) => {
      const form = new FormData()
      form.set("fileId", started.fileId)
      form.set("file", file)
      await api.uploadThroughServer(form)
    },
    finish: async (started) => {
      await api.completeUpload(started.fileId)
      return { fileId: started.fileId }
    }
  })
}
