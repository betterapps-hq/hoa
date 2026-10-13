import { describe, expect, it, vi } from "vitest"
import type { TemplateUpload } from "./projectTypes.functions"
import { templateHref, uploadTemplate, type TemplateUploadApi } from "./uploadTemplate"

const template = {
  id: "00000000-0000-4000-8000-000000000001",
  fileName: "approval.pdf",
  mediaType: "application/pdf",
  sizeBytes: 4
}

function api(uploadUrl: string | null, response = new Response(null, { status: 200 })) {
  return {
    createUpload: vi.fn<TemplateUploadApi["createUpload"]>(async (): Promise<TemplateUpload> => ({
      template,
      uploadUrl,
      contentType: "application/pdf"
    })),
    uploadThroughServer: vi.fn<TemplateUploadApi["uploadThroughServer"]>(async () => undefined),
    fetch: vi.fn<typeof fetch>(async () => response)
  }
}

const pdf = new File(["%PDF"], "approval.pdf", { type: "application/pdf" })

describe("uploadTemplate", () => {
  it("puts the file to its presigned URL and returns what the document keeps", async () => {
    const client = api("https://r2.example/upload")
    expect(await uploadTemplate(client, "type-1", pdf)).toEqual(template)
    expect(client.createUpload).toHaveBeenCalledWith({
      projectTypeId: "type-1",
      fileName: "approval.pdf",
      mediaType: "application/pdf",
      sizeBytes: 4
    })
    expect(client.fetch).toHaveBeenCalledWith("https://r2.example/upload", expect.objectContaining({ method: "PUT" }))
    expect(client.uploadThroughServer).not.toHaveBeenCalled()
  })

  it("uploads through the server without a presigned URL", async () => {
    const client = api(null)
    await uploadTemplate(client, "type-1", pdf)
    const form = client.uploadThroughServer.mock.calls[0]?.[0]
    expect([form?.get("projectTypeId"), form?.get("templateId")]).toEqual(["type-1", template.id])
    expect(client.fetch).not.toHaveBeenCalled()
  })

  it("refuses a file a template can't be, and says when an upload fails", async () => {
    const photo = new File(["png"], "form.png", { type: "image/png" })
    await expect(uploadTemplate(api(null), "type-1", photo)).rejects.toThrow("form.png isn't a PDF or Word file.")
    await expect(
      uploadTemplate(api("https://r2.example/upload", new Response(null, { status: 403 })), "type-1", pdf)
    ).rejects.toThrow("approval.pdf didn't upload (403). Try again.")
  })

  it("links to the template's download", () => {
    expect(templateHref("type 1", template)).toBe(`/files/project-types/type%201/templates/${template.id}`)
  })
})
