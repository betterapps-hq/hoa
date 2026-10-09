import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import type { CitedProvision } from "../CitationPanel/CitationPanel"
import { RuleReference, type ReferencedRule } from "./RuleReference"

const citation = (label: string, text: string, anchors: CitedProvision["anchors"] = []): CitedProvision => ({
  provisionKey: `guidelines:${label}`,
  label: `Guidelines ${label}`,
  documentTitle: "Residential Design Guidelines",
  heading: null,
  intros: ["The following apply to fences:"],
  text,
  wrapUps: [],
  highlight: null,
  anchors
})

const rule: ReferencedRule = {
  key: "guidelines:5.4.2(i)#colors",
  title: "Composite colors by manufacturer",
  citations: [
    citation("5.4.2(i)", "Trex colors are limited to Winchester Grey.", [
      { fileId: "file-1", page: 3, start: 0, end: 10 }
    ]),
    citation("5.3", "Fences are wood or composite."),
    citation("5.3.2", "Listed manufacturers only.")
  ]
}

function setup(source?: CitationSource) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RuleReference rule={rule} source={source} />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("RuleReference", () => {
  it("names the rule by its title and main citation, with how many more it has", () => {
    setup()
    expect(screen.getByText("Composite colors by manufacturer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /all 3 citations/ })).toHaveTextContent("and 2 more")
  })

  it("shows the provision's text when the citation is focused", async () => {
    const user = setup()
    await user.tab()
    expect(screen.getByRole("button", { name: "Guidelines 5.4.2(i)" })).toHaveFocus()
    expect(await screen.findByText("Trex colors are limited to Winchester Grey.")).toBeInTheDocument()
  })

  it("opens the provision on its document page, highlighted", async () => {
    const loadPage = vi.fn<CitationSource["loadPage"]>(async (documentId, pageIndex) => ({
      documentId,
      title: "Guidelines",
      pageCount: 5,
      pageIndex,
      pageLabel: null,
      text: "Trex colors are limited to Winchester Grey."
    }))
    const user = setup({ documents: [{ id: "file-1", title: "Guidelines", pageCount: 5 }], loadPage })
    await user.click(screen.getByRole("button", { name: "Guidelines 5.4.2(i)" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("The following apply to fences:")).toBeInTheDocument()
    expect(loadPage).toHaveBeenCalledWith("file-1", 3)
    expect(await within(dialog).findByText("Page 3 of 5")).toBeInTheDocument()
    expect(dialog.querySelector("mark")).toHaveTextContent("Trex color")
  })

  it("says when a citation's document has no pages, and lists every citation on request", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: /all 3 citations/ }))
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Guidelines 5.4.2(i)", "Guidelines 5.3", "Guidelines 5.3.2"])
    expect(within(dialog).getAllByText(/pages aren’t available/)).toHaveLength(3)
  })
})
