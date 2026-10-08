import { describe, expect, it, vi } from "vitest"
import type { CreateFileUploadResult } from "./applications.functions"
import { uploadApplicationFiles, uploadProblem, type ApplicationUploadApi } from "./uploadApplicationFiles"

function api(uploadUrl: string | null, response = new Response(null, { status: 200 })) {
  let count = 0
  return {
    createUpload: vi.fn<ApplicationUploadApi["createUpload"]>(async (): Promise<CreateFileUploadResult> => ({
      fileId: `file-${++count}`,
      uploadUrl,
      contentType: "application/pdf"
    })),
    uploadThroughServer: vi.fn<ApplicationUploadApi["uploadThroughServer"]>(async () => undefined),
    completeUpload: vi.fn<ApplicationUploadApi["completeUpload"]>(async () => undefined),
    fetch: vi.fn<typeof fetch>(async () => response)
  }
}

const pdf = new File(["%PDF"], "form.pdf", { type: "application/pdf" })
const photo = new File(["png"], "gate.png", { type: "image/png" })

describe("uploadApplicationFiles", () => {
  it("puts each file to its presigned URL and completes it", async () => {
    const client = api("https://r2.example/upload")
    await uploadApplicationFiles(client, "app-1", [pdf, photo])
    expect(client.createUpload).toHaveBeenCalledWith({
      applicationId: "app-1",
      fileName: "form.pdf",
      mediaType: "application/pdf",
      sizeBytes: 4
    })
    expect(client.fetch).toHaveBeenCalledTimes(2)
    expect(client.completeUpload.mock.calls).toEqual([["file-1"], ["file-2"]])
    expect(client.uploadThroughServer).not.toHaveBeenCalled()
  })

  it("uploads through the server without a presigned URL", async () => {
    const client = api(null)
    await uploadApplicationFiles(client, "app-1", [pdf])
    const form = client.uploadThroughServer.mock.calls[0]?.[0]
    expect(form?.get("fileId")).toBe("file-1")
    expect(client.fetch).not.toHaveBeenCalled()
  })

  it("stops on a failed upload or a file it doesn't accept", async () => {
    await expect(
      uploadApplicationFiles(api("https://r2.example/upload", new Response(null, { status: 403 })), "app-1", [pdf])
    ).rejects.toThrow("form.pdf didn't upload (403). Try again.")
    const heic = new File(["x"], "fence.heic", { type: "image/heic" })
    expect(uploadProblem([pdf, heic])).toContain("Save photos as JPEG or PNG.")
    expect(uploadProblem([pdf])).toBeNull()
    await expect(uploadApplicationFiles(api(null), "app-1", [heic])).rejects.toThrow("fence.heic")
  })
})
