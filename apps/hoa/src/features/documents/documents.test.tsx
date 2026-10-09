import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
import type { CitationSource } from "./DocumentViewer/DocumentViewer"
import { GoverningDocuments, type GoverningDocumentsProps } from "./GoverningDocuments/GoverningDocuments"
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

const noPages: CitationSource = {
  documents: [],
  loadPage: async () => {
    throw new Error("No pages in this test.")
  }
}

describe("GoverningDocuments", () => {
  const props = {
    uploads: [] as GoverningDocument[],
    source: noPages,
    jobs: {},
    loadJob: vi.fn<GoverningDocumentsProps["loadJob"]>(async () => job()),
    onChanged: vi.fn<() => void>()
  }

  it("validates the upload form, then uploads the file with its details", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn<NonNullable<GoverningDocumentsProps["onUpload"]>>(async () => ({ documentId: "doc-2" }))
    render(<GoverningDocuments {...props} onUpload={onUpload} />, { wrapper })
    expect(screen.getByText("No documents yet")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Upload a document" }))
    const dialog = await screen.findByRole("dialog", { name: "Upload a governing document" })
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(await within(dialog).findByText("Enter a title.")).toBeInTheDocument()
    expect(within(dialog).getByText("Choose a file.")).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText("Kind"), "declaration")
    await user.type(within(dialog).getByLabelText("Title"), "CC&Rs")
    await user.upload(within(dialog).getByLabelText("File"), pdf())
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))

    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "declaration",
      title: "CC&Rs",
      effectiveDate: null,
      lineageId: null,
      amends: null
    })
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("explains a failed upload", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn<NonNullable<GoverningDocumentsProps["onUpload"]>>(async () =>
      Promise.reject(new Error("Already uploaded."))
    )
    render(<GoverningDocuments {...props} onUpload={onUpload} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Upload a document" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Title"), "CC&Rs")
    await user.upload(within(dialog).getByLabelText("File"), pdf())
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(await within(dialog).findByText("Already uploaded.")).toBeInTheDocument()
  })

  it("shows each document's current version with its earlier ones, to download, and uploads a new edition", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn<NonNullable<GoverningDocumentsProps["onUpload"]>>(async () => ({ documentId: "doc-3" }))
    const uploads = [
      document(),
      document({
        id: "doc-2",
        version: 2,
        uploadedAt: "2026-10-09T00:00:00.000Z",
        status: "processing",
        pageCount: null
      })
    ]
    render(<GoverningDocuments {...props} uploads={uploads} jobs={{ "doc-2": "job-1" }} onUpload={onUpload} />, {
      wrapper
    })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText(/version 2/)).toBeInTheDocument()
    expect(await screen.findByText("Describing drawings and photos: 3 of 12")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "1 earlier version" }))
    expect(screen.getByRole("link", { name: "Download Residential design guidelines, version 1" })).toHaveAttribute(
      "href",
      "/files/governing/doc-1?download"
    )

    await user.click(screen.getByRole("button", { name: "New version of Residential design guidelines" }))
    const dialog = await screen.findByRole("dialog", { name: "New version of Residential design guidelines" })
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Residential design guidelines")
    await user.upload(within(dialog).getByLabelText("File"), pdf())
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "design-guidelines",
      title: "Residential design guidelines",
      effectiveDate: null,
      lineageId: "doc-1",
      amends: null
    })
  })

  it("uploads an amendment to a document as a document of its own", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn<NonNullable<GoverningDocumentsProps["onUpload"]>>(async () => ({ documentId: "doc-3" }))
    render(<GoverningDocuments {...props} uploads={[document()]} onUpload={onUpload} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "New version of Residential design guidelines" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("radio", { name: "An amendment that changes part of it" }))
    await user.clear(within(dialog).getByLabelText("Title"))
    await user.type(within(dialog).getByLabelText("Title"), "First amendment")
    await user.upload(within(dialog).getByLabelText("File"), pdf())
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "amendment",
      title: "First amendment",
      effectiveDate: null,
      lineageId: null,
      amends: "doc-1"
    })
  })

  it("lets a member read and download the documents, without uploading", () => {
    render(<GoverningDocuments {...props} uploads={[document()]} />, { wrapper })
    expect(screen.getByRole("link", { name: "Download Residential design guidelines" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Read Residential design guidelines" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Upload|New version/ })).not.toBeInTheDocument()
  })
})
