import { createUploader } from "@uploadcn/core"
import { describe, expect, it, vi } from "vitest"
import { uploadAll } from "@/storage/serverUpload"
import type { TemplateUpload } from "./projectTypes.functions"
import { templateAdapter, templateHref, type TemplateUploadApi } from "./uploadTemplate"

const template = {
  id: "00000000-0000-4000-8000-000000000001",
  fileName: "approval.pdf",
  mediaType: "application/pdf",
  sizeBytes: 4
}

function api(uploadUrl: string | null) {
  return {
    createUpload: vi.fn<TemplateUploadApi["createUpload"]>(async (): Promise<TemplateUpload> => ({
      template,
      uploadUrl,
      contentType: "application/pdf"
    })),
    uploadThroughServer: vi.fn<TemplateUploadApi["uploadThroughServer"]>(async () => undefined)
  }
}

const pdf = new File(["%PDF"], "approval.pdf", { type: "application/pdf" })

/** UploadCN's queue with the template adapter, as the document dialog runs it. */
const queue = (client: ReturnType<typeof api>) =>
  createUploader({ adapter: templateAdapter(client, "type-1"), autoUpload: false, retry: false, network: false })

describe("templateAdapter", () => {
  it("starts the template's upload, sends it through the server without a presigned URL and returns it", async () => {
    const client = api(null)
    const uploader = queue(client)
    await uploader.add([pdf])
    const [item] = await uploadAll(uploader)
    expect(item?.result).toEqual(template)
    expect(client.createUpload).toHaveBeenCalledWith({
      projectTypeId: "type-1",
      fileName: "approval.pdf",
      mediaType: "application/pdf",
      sizeBytes: 4
    })
    const form = client.uploadThroughServer.mock.calls[0]?.[0]
    expect([form?.get("projectTypeId"), form?.get("templateId")]).toEqual(["type-1", template.id])
  })

  it("leaves a file that didn't upload failed, for the dialog to say so", async () => {
    const client = api(null)
    client.uploadThroughServer.mockRejectedValue(new Error("Network"))
    const uploader = queue(client)
    await uploader.add([pdf])
    const [item] = await uploadAll(uploader)
    expect(item?.status).toBe("error")
  })

  it("links to the template's download", () => {
    expect(templateHref("type 1", template)).toBe(`/files/project-types/type%201/templates/${template.id}`)
  })
})
