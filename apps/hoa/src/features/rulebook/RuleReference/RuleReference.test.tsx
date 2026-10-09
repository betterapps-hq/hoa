import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import type { CitedProvision } from "../CitationViewer/CitationViewer"
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

  it("opens the document at the provision, highlighted, in the citation viewer", async () => {
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
    const viewer = await screen.findByRole("dialog", { name: "Guidelines 5.4.2(i)" })
    expect(loadPage).toHaveBeenCalledWith("file-1", 3)
    expect(await within(viewer).findByText("Page 3 of 5")).toBeInTheDocument()
    expect(viewer.querySelector("mark")).toHaveTextContent("Trex color")
    expect(within(viewer).getByRole("link", { name: /Download/ })).toHaveAttribute(
      "href",
      "/files/governing/file-1?download"
    )
    expect(within(viewer).getByRole("link", { name: /Open the original/ })).toHaveAttribute(
      "href",
      "/files/governing/file-1#page=3"
    )
  })

  it("shows the provision as stored when its document has no pages, and switches between every citation", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: /all 3 citations/ }))
    const viewer = await screen.findByRole("dialog", { name: "Guidelines 5.4.2(i)" })
    expect(within(viewer).getByText(/pages aren’t available/)).toBeInTheDocument()
    const picker = within(viewer).getByRole("combobox", { name: "Citation" })
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Guidelines 5.4.2(i) (main)", "Guidelines 5.3", "Guidelines 5.3.2"])
    await user.selectOptions(picker, "1")
    expect(await screen.findByRole("dialog", { name: "Guidelines 5.3" })).toHaveTextContent(
      "Fences are wood or composite."
    )
  })
})
