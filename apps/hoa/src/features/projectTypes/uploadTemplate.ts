import type { UploadAdapter } from "@uploadcn/core"
import type { DocumentTemplate } from "@/projectTypes/projectType"
import { serverUploadAdapter } from "@/storage/serverUpload"
import type { TemplateUpload } from "./projectTypes.functions"

// A document's template (application-review.md, Project types): uploaded when the administrator saves the document
// (src/storage/serverUpload.ts). The type's next save checks it's there.

export type TemplateUploadApi = {
  createUpload: (input: {
    projectTypeId: string
    fileName: string
    mediaType: string
    sizeBytes: number
  }) => Promise<TemplateUpload>
  uploadThroughServer: (form: FormData) => Promise<void>
}

/** Where homeowners download a document's template. */
export const templateHref = (projectTypeId: string, template: DocumentTemplate) =>
  `/files/project-types/${encodeURIComponent(projectTypeId)}/templates/${encodeURIComponent(template.id)}`

/** Where a project type's new templates go: what a document keeps of each comes back as its result. */
export function templateAdapter(api: TemplateUploadApi, projectTypeId: string): UploadAdapter<DocumentTemplate> {
  return serverUploadAdapter({
    name: "template",
    start: (file) =>
      api.createUpload({ projectTypeId, fileName: file.name, mediaType: file.type, sizeBytes: file.size }),
    throughServer: async (started, file) => {
      const form = new FormData()
      form.set("projectTypeId", projectTypeId)
      form.set("templateId", started.template.id)
      form.set("file", file)
      await api.uploadThroughServer(form)
    },
    finish: async (started) => started.template
  })
}
