import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
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

describe("GoverningDocuments", () => {
  const props = {
    uploads: [] as GoverningDocument[],
    jobs: {},
    loadJob: vi.fn<GoverningDocumentsProps["loadJob"]>(async () => job()),
    onChanged: vi.fn<() => void>()
  }
  const file = (name: string) => new File(["%PDF"], name, { type: "application/pdf" })
  const bylaws = document({ id: "doc-9", lineageId: "doc-9", kind: "bylaws", title: "Bylaws of the association" })
  const uploader = () => vi.fn<NonNullable<GoverningDocumentsProps["onUpload"]>>(async () => ({ documentId: "doc-3" }))

  it("asks for a file, then a kind and title, and uploads a first document", async () => {
    const user = userEvent.setup()
    const onUpload = uploader()
    render(<GoverningDocuments {...props} onUpload={onUpload} />, { wrapper })
    expect(screen.getByText("No documents yet")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Upload a document" }))
    const dialog = await screen.findByRole("dialog", { name: "Upload a governing document" })
    expect(within(dialog).queryByLabelText(/Title/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(await within(dialog).findByText("Choose a file.")).toBeInTheDocument()

    await user.upload(within(dialog).getByLabelText(/File/), pdf())
    // With nothing uploaded yet, there's nothing it could be a new version of.
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(await within(dialog).findByText("Enter a title.")).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText("Kind"), "declaration")
    await user.type(within(dialog).getByLabelText(/Title/), "CC&Rs")
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
    await user.upload(within(dialog).getByLabelText(/File/), pdf())
    await user.type(within(dialog).getByLabelText(/Title/), "CC&Rs")
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(await within(dialog).findByText("Already uploaded.")).toBeInTheDocument()
  })

  it("guesses from the file's name which document it's a new version of, and uploads a new edition", async () => {
    const user = userEvent.setup()
    const onUpload = uploader()
    render(<GoverningDocuments {...props} uploads={[document(), bylaws]} onUpload={onUpload} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Upload" }))
    const dialog = await screen.findByRole("dialog", { name: "Upload a governing document" })
    await user.upload(within(dialog).getByLabelText(/File/), file("Residential-Design-Guidelines_2027.pdf"))

    const what = within(dialog).getByRole("radiogroup", { name: "What is this file?" })
    expect(within(what).getAllByRole("radio")).toHaveLength(3)
    expect(within(what).getByRole("radio", { name: "A new version of Residential design guidelines" })).toBeChecked()
    expect(within(dialog).getByRole("radio", { name: "A new edition that replaces it" })).toBeChecked()
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue("Residential design guidelines")
    expect(within(dialog).queryByLabelText("Kind")).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "design-guidelines",
      title: "Residential design guidelines",
      effectiveDate: null,
      lineageId: "doc-1",
      amends: null
    })
  })

  it("guesses a new document for a file it can't place, and lets the person say otherwise", async () => {
    const user = userEvent.setup()
    const onUpload = uploader()
    render(<GoverningDocuments {...props} uploads={[document(), bylaws]} onUpload={onUpload} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Upload" }))
    const dialog = await screen.findByRole("dialog")
    await user.upload(within(dialog).getByLabelText(/File/), file("scan0042.pdf"))
    expect(within(dialog).getByRole("radio", { name: "A new document" })).toBeChecked()
    expect(within(dialog).getByLabelText("Kind")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("radio", { name: "A new version of Bylaws of the association" }))
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue("Bylaws of the association")
    await user.click(within(dialog).getByRole("radio", { name: "A new document" }))
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue("")
    await user.type(within(dialog).getByLabelText(/Title/), "Pool rules")
    await user.selectOptions(within(dialog).getByLabelText("Kind"), "rules-and-regulations")
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "rules-and-regulations",
      title: "Pool rules",
      effectiveDate: null,
      lineageId: null,
      amends: null
    })
  })

  it("shows each document's current version with its earlier ones, each title opening the reader", async () => {
    const user = userEvent.setup()
    const uploads = [
      document(),
      document({
        id: "doc-2",
        version: 2,
        uploadedAt: "2026-10-09T00:00:00.000Z",
        status: "processing",
        pageCount: null
      }),
      bylaws
    ]
    render(<GoverningDocuments {...props} uploads={uploads} jobs={{ "doc-2": "job-1" }} onUpload={uploader()} />, {
      wrapper
    })
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText(/version 2/)).toBeInTheDocument()
    expect(await screen.findByText("Describing drawings and photos: 3 of 12")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Bylaws of the association" })).toBeInTheDocument()
    // A new version goes through the one Upload, which asks what the file is; rows only read and download.
    expect(screen.queryByRole("button", { name: /New version|Actions/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Upload" })).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "1 earlier version" }))
    expect(screen.getByRole("link", { name: "Download Residential design guidelines, version 1" })).toHaveAttribute(
      "href",
      "/files/governing/doc-1?download"
    )
  })

  it("uploads an amendment to an existing document through the one Upload", async () => {
    const user = userEvent.setup()
    const onUpload = uploader()
    render(<GoverningDocuments {...props} uploads={[document(), bylaws]} onUpload={onUpload} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Upload" }))
    const dialog = await screen.findByRole("dialog", { name: "Upload a governing document" })
    await user.upload(within(dialog).getByLabelText(/File/), pdf())
    await user.click(within(dialog).getByRole("radio", { name: "A new version of Bylaws of the association" }))

    await user.click(within(dialog).getByRole("radio", { name: "An amendment that changes part of it" }))
    expect(within(dialog).getByLabelText(/Title of the amendment/)).toHaveValue("")
    await user.type(within(dialog).getByLabelText(/Title of the amendment/), "First amendment")
    await user.click(within(dialog).getByRole("button", { name: "Upload" }))
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), {
      kind: "amendment",
      title: "First amendment",
      effectiveDate: null,
      lineageId: null,
      amends: "doc-9"
    })
  })

  it("lets a member read and download the documents, without uploading", () => {
    render(<GoverningDocuments {...props} uploads={[document()]} />, { wrapper })
    expect(screen.getByRole("link", { name: "Download Residential design guidelines" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Residential design guidelines" })).toHaveAttribute(
      "href",
      "/documents/doc-1"
    )
    expect(screen.queryByRole("button", { name: /Upload|New version|Actions/ })).not.toBeInTheDocument()
  })
})
