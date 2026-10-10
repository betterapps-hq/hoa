import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentReading, ReadingBlock } from "@/documents/reading"
import { getDocumentReading, locateProvisions } from "../documents.functions"
import { DocumentReader } from "./DocumentReader"

vi.mock("../documents.functions", () => ({
  getDocumentReading: vi.fn<() => Promise<DocumentReading>>(),
  locateProvisions: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
  getPageGeometry: vi.fn<() => Promise<unknown[]>>(async () => [])
}))

// pdf.js doesn't run here: the original view's file fails to open, which it says.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error("No PDF in tests.")) })
}))
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }))

const block = (
  key: string,
  depth: number,
  page: number,
  overrides: Partial<Extract<ReadingBlock, { type: "provision" }>> = {}
): ReadingBlock => ({
  type: "provision",
  key,
  provisionKey: key,
  part: "main",
  depth,
  number: null,
  heading: null,
  level: null,
  text: "",
  intro: null,
  at: { fileId: "upload-1", page },
  anchors: [{ fileId: "upload-1", page, start: 0, end: 10 }],
  ...overrides
})

const reading = (overrides: Partial<DocumentReading> = {}): DocumentReading => ({
  id: "upload-1",
  title: "Community Rules",
  edition: "Board approved 2026-01-05",
  pageCount: 2,
  isStructured: true,
  newerVersionId: null,
  original: null,
  files: [{ id: "upload-1", title: "Community Rules" }],
  pages: [
    { fileId: "upload-1", page: 1, label: null },
    { fileId: "upload-1", page: 2, label: "ii" }
  ],
  blocks: [
    block("rules:article-1", 0, 1, { number: "Article 1", heading: "General Matters", level: 2 }),
    block("rules:1.1", 1, 1, { number: "1.1", heading: "Yards", level: 3, text: "The owner keeps the yard tidy." }),
    block("rules:1.1(a)", 2, 1, { number: "(a)", text: "Lawns are mowed weekly." }),
    block("rules:1.2", 1, 2, { number: "1.2", heading: "Hedges", level: 3, text: "Hedges are trimmed in spring." })
  ],
  outline: [
    { key: "rules:article-1", number: "Article 1", title: "General Matters", level: 1 },
    { key: "rules:1.1", number: "1.1", title: "Yards", level: 2 },
    { key: "rules:1.2", number: "1.2", title: "Hedges", level: 2 }
  ],
  ...overrides
})

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <div style={{ height: 600 }}>{children}</div>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(getDocumentReading).mockResolvedValue(reading())
  window.localStorage.clear()
})

describe("DocumentReader", () => {
  it("shows the whole document in its structure, with page markers that match the paper", async () => {
    render(<DocumentReader documentId="upload-1" />, { wrapper })
    expect(await screen.findByRole("heading", { level: 2, name: "Community Rules" })).toBeInTheDocument()
    expect(screen.getByText("Board approved 2026-01-05")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Article 1 General Matters" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 4, name: "1.1 Yards" })).toBeInTheDocument()
    expect(screen.getByText("Lawns are mowed weekly.")).toBeInTheDocument()
    expect(screen.getAllByRole("separator").map((marker) => marker.getAttribute("aria-label"))).toEqual([
      "Page 1",
      "Page 2, printed ii"
    ])
    expect(screen.getByRole("link", { name: /Open the original/ }).getAttribute("href")).toMatch(
      /^\/files\/governing\/upload-1#page=\d$/
    )
    expect(screen.queryByRole("group", { name: "Show" })).not.toBeInTheDocument()
  })

  it("opens at a cited provision, marked with everything under it, and moves focus there", async () => {
    render(<DocumentReader documentId="upload-1" provision="rules:1.1" />, { wrapper })
    const cited = await screen.findByRole("region", { name: "Cited passage" })
    expect(within(cited).getByRole("heading", { name: "1.1 Yards" })).toBeInTheDocument()
    expect(within(cited).getByText("Lawns are mowed weekly.")).toBeInTheDocument()
    expect(within(cited).queryByText("Hedges are trimmed in spring.")).not.toBeInTheDocument()
    await waitFor(() => expect(cited).toHaveFocus())
  })

  it("steps through a rule's citations, and says when a cited passage isn't in this version", async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn<(target: { documentId: string; provision: string | null }) => void>()
    const { rerender } = render(
      <DocumentReader
        documentId="upload-1"
        provision="rules:1.1"
        cites={["rules:1.1", "rules:1.2"]}
        onNavigate={onNavigate}
      />,
      { wrapper }
    )
    expect(await screen.findByText("Citation 1 of 2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous citation" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Next citation: Rules 1.2: Hedges" }))
    expect(onNavigate).toHaveBeenCalledWith({ documentId: "upload-1", provision: "rules:1.2" })

    rerender(<DocumentReader documentId="upload-1" provision="rules:9.9" onNavigate={onNavigate} />)
    expect(await screen.findByText(/The cited passage isn’t in this version/)).toBeInTheDocument()
  })

  it("steps on its own without a parent to follow it", async () => {
    const user = userEvent.setup()
    render(<DocumentReader documentId="upload-1" provision="rules:1.1" cites={["rules:1.1", "rules:1.2"]} />, {
      wrapper
    })
    await user.click(await screen.findByRole("button", { name: /Next citation/ }))
    expect(await screen.findByText("Citation 2 of 2")).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Cited passage" })).getByText("Hedges are trimmed in spring.")
    ).toBeInTheDocument()
  })

  it("searches the document and goes to a match, and lists its parts to go to", async () => {
    const user = userEvent.setup()
    render(<DocumentReader documentId="upload-1" />, { wrapper })
    const [search] = await screen.findAllByRole("searchbox", { name: "Search this document" })
    const contents = screen.getAllByRole("navigation", { name: "Contents" })[0]
    expect(
      within(contents!)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Article 1General Matters", "1.1Yards", "1.2Hedges"])
    await user.type(search!, "hedge")
    expect(await screen.findByText("1 passage matches.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /1\.2 Hedges/ }))
    const match = document.querySelector('[data-block="rules:1.2"]')
    await waitFor(() => expect(match).toHaveFocus())
    expect(match?.querySelector("mark")).toHaveTextContent("Hedges")
  })

  it("offers the original beside the text, and says when its file won't open", async () => {
    vi.mocked(getDocumentReading).mockResolvedValue(reading({ original: { hasWordBoxes: true } }))
    window.localStorage.setItem("document-reader-view", "text")
    const user = userEvent.setup()
    render(<DocumentReader documentId="upload-1" />, { wrapper })
    const original = await screen.findByRole("button", { name: "Original" })
    await user.click(original)
    expect(await screen.findByText("The original can’t be shown", {}, { timeout: 4000 })).toBeInTheDocument()
    expect(window.localStorage.getItem("document-reader-view")).toBe("original")
    await user.click(screen.getByRole("button", { name: "Text" }))
    expect(screen.getByText("Lawns are mowed weekly.")).toBeVisible()
  })

  it("explains a document it can't show", async () => {
    vi.mocked(getDocumentReading).mockRejectedValue(new Error("That document isn't ready to read."))
    render(<DocumentReader documentId="missing" />, { wrapper })
    expect(await screen.findByText("This document can’t be shown")).toBeInTheDocument()
    expect(screen.getByText("That document isn't ready to read.")).toBeInTheDocument()
    expect(locateProvisions).not.toHaveBeenCalled()
  })
})
