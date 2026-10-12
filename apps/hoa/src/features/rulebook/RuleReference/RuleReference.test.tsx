import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { CitedProvision } from "../citedProvision"
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

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RuleReference rule={rule} />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("RuleReference", () => {
  it("names the rule by its title and main citation, with how many more it has", () => {
    setup()
    expect(screen.getByText("Composite colors by manufacturer")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /all 3 citations/ })).toHaveTextContent("and 2 more")
  })

  it("shows the provision's text when the citation is focused", async () => {
    const user = setup()
    await user.tab()
    expect(screen.getByRole("link", { name: "Guidelines 5.4.2(i)" })).toHaveFocus()
    expect(await screen.findByText("Trex colors are limited to Winchester Grey.")).toBeInTheDocument()
  })

  it("links the citation to the document reader at the provision, with the rule's citations to step through", () => {
    setup()
    expect(screen.getByRole("link", { name: "Guidelines 5.4.2(i)" })).toHaveAttribute(
      "href",
      "/documents/file-1?provision=guidelines%3A5.4.2%28i%29&cites=guidelines%3A5.4.2%28i%29%2Cguidelines%3A5.3%2Cguidelines%3A5.3.2"
    )
  })

  it("lists every citation by document in a picker, each linking to the document reader at its passage", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: /all 3 citations/ }))
    const list = await screen.findByRole("region", { name: /Guidelines|Design/ })
    const links = within(list).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Guidelines 5.4.2(i)"),
      expect.stringContaining("Guidelines 5.3"),
      expect.stringContaining("Guidelines 5.3.2")
    ])
    expect(links[1]).toHaveTextContent("Fences are wood or composite.")
    expect(links[1]?.getAttribute("href")).toContain("provision=guidelines%3A5.3")
  })
})
