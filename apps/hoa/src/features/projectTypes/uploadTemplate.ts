import type { DocumentTemplate } from "@/projectTypes/projectType"
import { validateUpload } from "@/storage/uploadRules"
import type { TemplateUpload } from "./projectTypes.functions"

// A document's template (application-review.md, Project types): uploaded when the administrator saves the document,
// straight to R2 with a presigned URL when the environment has one, otherwise through the server. The type's next
// save checks it's there.

export type TemplateUploadApi = {
  createUpload: (input: {
    projectTypeId: string
    fileName: string
    mediaType: string
    sizeBytes: number
  }) => Promise<TemplateUpload>
  uploadThroughServer: (form: FormData) => Promise<void>
  fetch?: typeof fetch
}

/** Where homeowners download a document's template. */
export const templateHref = (projectTypeId: string, template: DocumentTemplate) =>
  `/files/project-types/${encodeURIComponent(projectTypeId)}/templates/${encodeURIComponent(template.id)}`

/** Uploads one template file and returns what the document keeps of it. */
export async function uploadTemplate(
  api: TemplateUploadApi,
  projectTypeId: string,
  file: File
): Promise<DocumentTemplate> {
  const validation = validateUpload({ name: file.name, type: file.type, size: file.size }, "template")
  if (!validation.isValid) {
    throw new Error(validation.message)
  }
  const created = await api.createUpload({
    projectTypeId,
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
    form.set("projectTypeId", projectTypeId)
    form.set("templateId", created.template.id)
    form.set("file", file)
    await api.uploadThroughServer(form)
  }
  return created.template
}
