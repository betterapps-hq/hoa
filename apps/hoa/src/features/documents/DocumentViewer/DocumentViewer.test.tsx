import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DocumentPage } from "../documents.functions"
import { DocumentViewer, type CitationSource } from "./DocumentViewer"
import { highlightRanges, splitByRanges } from "./DocumentViewer.utils"

const text = "## 5.4 Fence Colors\n\nFence colors are limited to the following:\n\n- Cedar stain\n- Drift Gray"

function source(pages: Record<number, string> = { 17: text }): CitationSource {
  return {
    documents: [{ id: "doc-1", title: "Design guidelines", pageCount: 56 }],
    loadPage: vi.fn<CitationSource["loadPage"]>(async (documentId, pageIndex): Promise<DocumentPage> => ({
      documentId,
      title: "Design guidelines",
      pageCount: 56,
      pageIndex,
      pageLabel: String(pageIndex - 2),
      text: pages[pageIndex] ?? `Page ${pageIndex} text`
    }))
  }
}

function renderViewer(props: Partial<Parameters<typeof DocumentViewer>[0]> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  const viewerSource = props.source ?? source()
  render(<DocumentViewer source={viewerSource} documentId="doc-1" defaultPage={17} {...props} />, { wrapper })
  return { source: viewerSource, user: userEvent.setup() }
}

const range = (passage: string) => ({ start: text.indexOf(passage), end: text.indexOf(passage) + passage.length })

describe("DocumentViewer", () => {
  it("renders the page's Markdown with the cited passage highlighted", async () => {
    renderViewer({ highlights: [{ documentId: "doc-1", pageIndex: 17, range: range("Drift Gray") }] })
    expect(await screen.findByRole("heading", { name: "5.4 Fence Colors" })).toBeInTheDocument()
    expect(screen.getByText("Drift Gray").tagName).toBe("MARK")
    expect(screen.getByText("Page 17 of 56, printed 15")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Design guidelines, page 17" })).toBeInTheDocument()
  })

  it("pages through the document", async () => {
    const { source: viewerSource, user } = renderViewer()
    await screen.findByText(/limited to the following/)
    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(await screen.findByText("Page 18 text")).toBeInTheDocument()
    expect(viewerSource.loadPage).toHaveBeenLastCalledWith("doc-1", 18)
    await user.click(screen.getByRole("button", { name: "Previous page" }))
    expect(await screen.findByText(/limited to the following/)).toBeInTheDocument()
  })

  it("chooses a highlighted passage by its id", async () => {
    const onSelect = vi.fn<(id: string) => void>()
    const { user } = renderViewer({
      highlights: [{ documentId: "doc-1", pageIndex: 17, range: range("Cedar stain"), id: "p-1", tone: "bg-muted" }],
      onSelect
    })
    await user.click(await screen.findByText("Cedar stain"))
    expect(onSelect).toHaveBeenCalledWith("p-1")
  })
})

describe("viewer utilities", () => {
  it("orders highlight ranges and gives overlapping text to the one that starts first", () => {
    expect(
      highlightRanges([
        { range: { start: 4, end: 9 }, id: "b", tone: "x" },
        { range: { start: 0, end: 6 }, id: "a", tone: "y" },
        { range: { start: 9, end: 12 }, id: "b", tone: "x" },
        { range: { start: 3, end: 3 } }
      ])
    ).toEqual([
      { start: 0, end: 6, id: "a", tone: "y" },
      { start: 6, end: 12, id: "b", tone: "x" }
    ])
  })

  it("splits a run of text into plain and highlighted pieces with source offsets", () => {
    const highlight = { start: 16, end: 21, id: null, tone: null }
    expect(splitByRanges("hello world", 10, [highlight])).toEqual([
      { start: 10, text: "hello ", range: null },
      { start: 16, text: "world", range: highlight }
    ])
    expect(splitByRanges("abc", 0, [{ start: 5, end: 9, id: null, tone: null }])).toEqual([
      { start: 0, text: "abc", range: null }
    ])
  })
})
