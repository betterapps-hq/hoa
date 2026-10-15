import { createUploader } from "@uploadcn/core"
import { describe, expect, it, vi } from "vitest"
import { uploadAll } from "@/storage/serverUpload"
import type { CreateFileUploadResult } from "./applications.functions"
import { applicationAdapter, type ApplicationUploadApi } from "./uploadApplicationFiles"

function api() {
  let count = 0
  return {
    createUpload: vi.fn<ApplicationUploadApi["createUpload"]>(async (): Promise<CreateFileUploadResult> => ({
      fileId: `file-${++count}`,
      uploadUrl: null,
      contentType: "application/pdf"
    })),
    uploadThroughServer: vi.fn<ApplicationUploadApi["uploadThroughServer"]>(async () => undefined),
    completeUpload: vi.fn<ApplicationUploadApi["completeUpload"]>(async () => undefined)
  }
}

const pdf = new File(["%PDF"], "site plan.pdf", { type: "application/pdf" })
const photo = new File(["png"], "gate.png", { type: "image/png" })

describe("applicationAdapter", () => {
  it("records each file as what it was said to be, sends it through the server and completes it", async () => {
    const client = api()
    const uploader = createUploader({
      adapter: applicationAdapter(client, "app-1", (file) => (file === pdf ? "site-plan" : null)),
      autoUpload: false,
      retry: false,
      network: false
    })
    await uploader.add([pdf, photo])
    const items = await uploadAll(uploader)
    expect(items.map((item) => item.result)).toEqual([{ fileId: "file-1" }, { fileId: "file-2" }])
    expect(client.createUpload.mock.calls.map(([input]) => input)).toEqual([
      {
        applicationId: "app-1",
        fileName: "site plan.pdf",
        mediaType: "application/pdf",
        sizeBytes: 4,
        uploadedAs: "site-plan"
      },
      { applicationId: "app-1", fileName: "gate.png", mediaType: "image/png", sizeBytes: 3 }
    ])
    expect(client.uploadThroughServer.mock.calls.map(([form]) => form.get("fileId"))).toEqual(["file-1", "file-2"])
    expect(client.completeUpload.mock.calls.map(([fileId]) => fileId)).toEqual(["file-1", "file-2"])
  })
})
