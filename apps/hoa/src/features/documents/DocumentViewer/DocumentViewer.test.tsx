import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DocumentPage } from "../documents.functions"
import { DocumentViewer, type CitationSource, type PageSelectionInput } from "./DocumentViewer"
import { highlightRanges, selectionRange, splitByRanges } from "./DocumentViewer.utils"

const text = "## 5.4 Fence Colors\n\nFence colors are limited to the following:\n\n- Behr: Cedar (SC-146)\n- Drift Gray"

function source(pages: Record<number, string> = { 17: text }): CitationSource {
  return {
    documents: [
      { id: "doc-1", title: "Design guidelines", pageCount: 56 },
      { id: "doc-2", title: "CC&Rs", pageCount: 30 }
    ],
    loadPage: vi.fn<CitationSource["loadPage"]>(async (documentId, pageIndex): Promise<DocumentPage> => ({
      documentId,
      title: "Design guidelines",
      pageCount: 56,
      pageIndex,
      pageLabel: String(pageIndex),
      text: pages[pageIndex] ?? `Page ${pageIndex} text`
    }))
  }
}

function renderViewer(props: Partial<Parameters<typeof DocumentViewer>[0]> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  const viewerSource = props.source ?? source()
  render(<DocumentViewer source={viewerSource} initial={{ documentId: "doc-1", pageIndex: 17 }} {...props} />, {
    wrapper
  })
  return { source: viewerSource, user: userEvent.setup() }
}

/** Selects the text between two strings on the rendered page, the way a reader's drag would. */
function selectBetween(container: HTMLElement, from: string, to: string) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text)
  }
  const startNode = nodes.find((node) => node.data.includes(from))!
  const endNode = nodes.find((node) => node.data.includes(to))!
  const range = document.createRange()
  range.setStart(startNode, startNode.data.indexOf(from))
  range.setEnd(endNode, endNode.data.indexOf(to) + to.length)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

describe("DocumentViewer", () => {
  it("renders the page's Markdown and highlights cited passages", async () => {
    renderViewer({ highlights: [{ documentId: "doc-1", pageIndex: 17, quote: "Drift Gray" }] })
    expect(await screen.findByRole("heading", { name: "5.4 Fence Colors" })).toBeInTheDocument()
    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getByText("Drift Gray").tagName).toBe("MARK")
    expect(screen.getByText("Page 17 of 56 (printed 17)")).toBeInTheDocument()
  })

  it("pages through the document and switches documents", async () => {
    const { source: viewerSource, user } = renderViewer()
    await screen.findByText(/limited to the following/)
    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(await screen.findByText("Page 18 text")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Previous page" }))
    await user.selectOptions(screen.getByLabelText("Document"), "doc-2")
    expect(viewerSource.loadPage).toHaveBeenLastCalledWith("doc-2", 1)
  })

  it("cites a selection by its range in the stored page", async () => {
    const onCite = vi.fn<(selection: PageSelectionInput) => Promise<void>>(async () => undefined)
    const { user } = renderViewer({ onCite })
    const paragraph = await screen.findByText(/limited to the following/)
    expect(screen.getByRole("button", { name: "Add as citation" })).toBeDisabled()

    const page = paragraph.closest(".document-page") as HTMLElement
    selectBetween(page, "Fence colors", "Drift Gray")
    fireEvent(document, new Event("selectionchange"))
    await user.click(screen.getByRole("button", { name: "Add as citation" }))

    expect(onCite).toHaveBeenCalledWith({
      documentId: "doc-1",
      pageIndex: 17,
      start: text.indexOf("Fence colors"),
      end: text.indexOf("Drift Gray") + "Drift Gray".length
    })
  })
})

describe("viewer utilities", () => {
  it("finds and merges highlight ranges, preferring a stored range", () => {
    expect(
      highlightRanges("abc def ghi", [
        { quote: "def" },
        { quote: "ef g" },
        { quote: "missing" },
        { quote: "x", range: { start: 0, end: 1 } }
      ])
    ).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 9 }
    ])
  })

  it("splits a run of text into plain and highlighted pieces with source offsets", () => {
    expect(splitByRanges("hello world", 10, [{ start: 16, end: 21 }])).toEqual([
      { start: 10, text: "hello ", isHighlight: false },
      { start: 16, text: "world", isHighlight: true }
    ])
    expect(splitByRanges("abc", 0, [{ start: 5, end: 9 }])).toEqual([{ start: 0, text: "abc", isHighlight: false }])
  })

  it("ignores a selection outside the page or with nothing selected", () => {
    const { container: root } = render(<span data-source="4">text</span>)
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(root, 0)
    expect(selectionRange(root, range)).toBeNull()

    range.setStart(root, 0)
    range.setEnd(root, 1)
    expect(selectionRange(root, range)).toEqual({ start: 4, end: 8 })
  })
})
