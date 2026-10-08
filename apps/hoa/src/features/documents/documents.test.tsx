import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
import { DocumentsPage, type DocumentsPageProps } from "./DocumentsPage/DocumentsPage"
import { uploadDocument, type UploadApi } from "./uploadDocument"

const pdf = () => new File(["%PDF"], "guidelines.pdf", { type: "application/pdf" })
const details = { kind: "design-guidelines" as const, title: "Guidelines", effectiveDate: null }

function api(uploadUrl: string | null) {
  const calls: string[] = []
  const value: UploadApi = {
    createUpload: vi.fn<UploadApi["createUpload"]>(async () => {
      calls.push("create")
      return { documentId: "doc-1", uploadUrl, contentType: "application/pdf" }
    }),
    uploadThroughServer: vi.fn<UploadApi["uploadThroughServer"]>(async () => {
      calls.push("server")
    }),
    completeUpload: vi.fn<UploadApi["completeUpload"]>(async () => {
      calls.push("complete")
      return { jobId: "job-1" }
    }),
    fetch: vi.fn<typeof fetch>(async () => {
      calls.push("put")
      return new Response(null, { status: 200 })
    })
  }
  return { value, calls }
}

describe("uploadDocument", () => {
  it("uploads straight to R2 when the environment presigns", async () => {
    const { value, calls } = api("https://r2.example/put")
    expect(await uploadDocument(value, pdf(), details)).toEqual({ documentId: "doc-1", jobId: "job-1" })
    expect(calls).toEqual(["create", "put", "complete"])
    expect(value.fetch).toHaveBeenCalledWith("https://r2.example/put", expect.objectContaining({ method: "PUT" }))
  })

  it("uploads through the server otherwise, and reports a failed PUT", async () => {
    const server = api(null)
    await uploadDocument(server.value, pdf(), details)
    expect(server.calls).toEqual(["create", "server", "complete"])

    const failing = api("https://r2.example/put")
    failing.value.fetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 403 }))
    await expect(uploadDocument(failing.value, pdf(), details)).rejects.toThrow("The upload failed (403). Try again.")
  })
})

const document = (overrides: Partial<GoverningDocument> = {}): GoverningDocument => ({
  id: "doc-1",
  lineageId: "doc-1",
  version: 1,
  hoaId: "hoa",
  kind: "design-guidelines",
  amends: null,
  title: "Residential design guidelines",
  effectiveDate: null,
  fileName: "guidelines.pdf",
  mediaType: "application/pdf",
  sizeBytes: 100,
  sha256: null,
  pageCount: 47,
  status: "ready",
  error: null,
  uploadedBy: "admin",
  uploadedAt: "2026-10-08T00:00:00.000Z",
  ...overrides
})

const job = (overrides: Partial<Job> = {}): Job => ({
  id: "job-1",
  hoaId: "hoa",
  kind: "document-ingest",
  subjectId: "doc-1",
  status: "running",
  stage: "visuals",
  done: 3,
  total: 12,
  promptVersions: {},
  failures: [],
  error: null,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  ...overrides
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe("DocumentsPage", () => {
  const props = {
    documents: [] as GoverningDocument[],
    jobs: {},
    onUpload: vi.fn<DocumentsPageProps["onUpload"]>(async () => ({ documentId: "doc-2", jobId: "job-2" })),
    loadJob: vi.fn<DocumentsPageProps["loadJob"]>(async () => job()),
    onChanged: vi.fn<() => void>()
  }

  it("validates the form, then uploads the file with its details", async () => {
    const user = userEvent.setup()
    render(<DocumentsPage {...props} />, { wrapper })
    expect(screen.getByText("No documents yet")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Upload" }))
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument()
    expect(screen.getByText("Choose a file.")).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText("Kind"), "declaration")
    await user.type(screen.getByLabelText("Title"), "CC&Rs")
    await user.upload(screen.getByLabelText("File"), pdf())
    await user.click(screen.getByRole("button", { name: "Upload" }))

    expect(props.onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "declaration",
      title: "CC&Rs",
      effectiveDate: null
    })
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("explains a failed upload", async () => {
    const user = userEvent.setup()
    render(
      <DocumentsPage
        {...props}
        onUpload={vi.fn<DocumentsPageProps["onUpload"]>(async () => Promise.reject(new Error("Already uploaded.")))}
      />,
      {
        wrapper
      }
    )
    await user.type(screen.getByLabelText("Title"), "CC&Rs")
    await user.upload(screen.getByLabelText("File"), pdf())
    await user.click(screen.getByRole("button", { name: "Upload" }))
    expect(await screen.findByText("Already uploaded.")).toBeInTheDocument()
  })

  it("lists documents with their status and follows a running job", async () => {
    render(
      <DocumentsPage
        {...props}
        documents={[
          document(),
          document({ id: "doc-2", title: "CC&Rs", version: 2, status: "processing", pageCount: null }),
          document({
            id: "doc-3",
            title: "Copy",
            status: "failed",
            error: { stage: "ocr", message: "Already uploaded as CC&Rs, version 2.", isRetryable: false }
          })
        ]}
        jobs={{ "doc-2": "job-1" }}
      />,
      { wrapper }
    )
    expect(screen.getByText("Ready")).toBeInTheDocument()
    expect(screen.getByText("(version 2)")).toBeInTheDocument()
    expect(screen.getByText("Already uploaded as CC&Rs, version 2.")).toBeInTheDocument()
    expect(await screen.findByText("Describing drawings and photos: 3 of 12")).toBeInTheDocument()
  })
})
