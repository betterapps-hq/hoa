import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RulebookRecords } from "@/rulebook/assemble"
import type { SourceText } from "@/rulebook/coverage"
import { approvedReview, noPages, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import type { RulebookSource } from "../useRulebookWorkspace"
import { CoverageTab } from "./CoverageTab"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const records = sampleRecords()
// 3.1(a) loses its reason for having no rule (if it had one) and its rules, so nothing covers it.
const uncoveredKey = "declaration:3.1(a)"
const withUncovered = {
  ...records,
  provisions: records.provisions.map((provision) =>
    provision.key === uncoveredKey ? { ...provision, noRule: null } : provision
  ),
  rules: records.rules.filter((rule) => !rule.citations.some((citation) => citation.provisionKey === uncoveredKey))
}

// Synthetic pages: each provision of the sample sits on a page of its own, at the start of the page's text; 3.1(a)
// is on the first page.
const pageText = "Synthetic page text standing in for a governing document page."
function onPages(base: RulebookRecords): RulebookRecords {
  return {
    ...base,
    provisions: base.provisions.map((provision, index) => ({
      ...provision,
      anchors: [{ fileId: "upload", page: provision.key === uncoveredKey ? 1 : index + 2, start: 0, end: 30 }]
    }))
  }
}
function pagesSource(outside: SourceText[] = []): RulebookSource {
  return {
    documents: [{ id: "upload", title: "Uploaded declaration", pageCount: records.provisions.length + 1 }],
    loadPage: async (documentId, pageIndex) => ({
      documentId,
      title: "Uploaded declaration",
      pageCount: records.provisions.length + 1,
      pageIndex,
      pageLabel: null,
      text: pageText
    }),
    loadSourceText: async () => outside
  }
}
describe("CoverageTab", () => {
  it("says a document whose provisions aren't on any upload's pages isn't built yet, instead of a share", () => {
    renderInWorkspace(<CoverageTab />, { actions: null })
    expect(screen.getByText(/coverage can’t be measured\./)).toBeInTheDocument()
    expect(screen.getAllByText(/: not built yet\./).length).toBeGreaterThan(0)
    expect(screen.queryByText(/0% of the text/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "On the pages" })).toBeDisabled()
    expect(screen.getByRole("list", { name: "Provisions" })).toBeInTheDocument()
  })

  it("shows a built document on its pages, each passage highlighted, and what covers a chosen passage", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { records: onPages(records), source: pagesSource() })
    expect(
      screen.getByRole("heading", { name: /^\d+(\.\d)?% of the text of 3 documents is covered/ })
    ).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "What the colors mean" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "On the pages", pressed: true })).toBeInTheDocument()

    const page = await screen.findByRole("region", { name: /^Uploaded declaration, page \d+$/ })
    await waitFor(() => expect(page.querySelector("mark[data-highlight]")).not.toBeNull())
    while (!screen.queryByRole("region", { name: "On page 1" })) {
      await user.click(screen.getByRole("button", { name: "Previous page" }))
    }
    const onPage = screen.getByRole("region", { name: "On page 1" })
    await user.click(within(onPage).getByRole("button", { name: "Declaration 3.1(a): Rule" }))
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    const rules = within(panel).getByRole("region", { name: /^Rules \(\d+\)$/ })
    expect(
      within(rules).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })
    ).toBeInTheDocument()
    expect(within(panel).getByRole("region", { name: "Values its rules encode" })).toHaveTextContent("55 years")
  })

  it("lists the gaps, jumps to one and gives it a reason for having no rule", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab />, {
      records: onPages(withUncovered),
      source: pagesSource()
    })
    const gaps = screen.getByRole("region", { name: "1 gap" })
    await user.click(within(gaps).getByRole("button", { name: "Declaration 3.1(a): Uncovered" }))
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    expect(within(panel).getByText(/Nothing cites this provision/)).toBeInTheDocument()
    await user.click(within(panel).getByRole("button", { name: "Give a reason for having no rule" }))
    await user.selectOptions(within(panel).getByRole("combobox", { name: "Reason" }), "explanatory")
    await user.click(within(panel).getByRole("button", { name: "Save the reason" }))
    expect(actions?.setNoRule).toHaveBeenCalledWith(uncoveredKey, { reason: "explanatory", note: null })
  })

  it("shows why a passage has no rule, in the list beside the page and in its panel", async () => {
    const reviewed = {
      ...withUncovered,
      provisions: withUncovered.provisions.map((provision) =>
        provision.key === uncoveredKey
          ? {
              ...provision,
              noRule: {
                reason: "explanatory" as const,
                note: "Describes the community.",
                review: approvedReview
              }
            }
          : provision
      )
    }
    const { user } = renderInWorkspace(<CoverageTab />, { records: onPages(reviewed), source: pagesSource() })
    await screen.findByRole("region", { name: /^Uploaded declaration, page \d+$/ })
    while (!screen.queryByRole("region", { name: "On page 1" })) {
      await user.click(screen.getByRole("button", { name: "Previous page" }))
    }
    const onPage = screen.getByRole("region", { name: "On page 1" })
    const passage = within(onPage).getByRole("button", {
      name: "Declaration 3.1(a): No rule, reason approved, explains, requires nothing"
    })
    expect(within(passage).getByText("Explains, requires nothing. Describes the community.")).toBeInTheDocument()
    await user.click(passage)
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    const reason = within(panel).getByRole("region", { name: "Reason for having no rule" })
    expect(reason).toHaveTextContent("No rule: Explains, requires nothing")
    expect(reason).toHaveTextContent("Describes the community.")
  })

  it("shows page text outside any provision as a gap", async () => {
    const outside = { fileId: "upload", page: 2, start: 35, end: 60, text: "Text no provision holds." }
    const { user } = renderInWorkspace(<CoverageTab />, {
      records: onPages(records),
      source: pagesSource([{ fileId: "upload", skippedPages: [], outside: [outside] }])
    })
    const gaps = await screen.findByRole("region", { name: "1 gap" })
    await user.click(within(gaps).getByRole("button", { name: "Page 2: Outside any provision" }))
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    expect(within(panel).getByText(/the build placed it in no provision/)).toBeInTheDocument()
  })

  it("lists uncovered provisions first, and gives one a reason for having no rule", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab initialFilter="uncovered" />, { records: withUncovered })
    expect(screen.getByRole("button", { name: "Uncovered", pressed: true })).toBeInTheDocument()
    const [item] = within(screen.getByRole("list", { name: "Provisions" })).getAllByRole("listitem")
    expect(within(item!).getByText("No rule and no reason")).toBeInTheDocument()
    expect(within(item!).getByRole("link", { name: "Declaration 3.1(a)" })).toBeInTheDocument()
    await user.click(within(item!).getByRole("button", { name: "Give a reason for having no rule" }))
    await user.selectOptions(within(item!).getByRole("combobox", { name: "Reason" }), "explanatory")
    await user.type(within(item!).getByRole("textbox", { name: "Note" }), "Describes the community.")
    await user.click(within(item!).getByRole("button", { name: "Save the reason" }))
    expect(actions?.setNoRule).toHaveBeenCalledWith(uncoveredKey, {
      reason: "explanatory",
      note: "Describes the community."
    })
  })

  it("lists reasons to review, approves one, and approves those shown", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab initialFilter="to-review" />)
    expect(screen.getByRole("button", { name: "Reasons to review", pressed: true })).toBeInTheDocument()
    const [item] = within(screen.getByRole("list", { name: "Provisions" })).getAllByRole("listitem")
    expect(within(item!).getByText(/^No rule: /)).toBeInTheDocument()
    await user.click(within(item!).getByRole("button", { name: "Approve the reason" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "provision", key: expect.any(String) }], "approved", null)
    await user.click(screen.getByRole("button", { name: "Approve the 196 reasons shown" }))
    await user.click(await screen.findByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: "provision" })]),
      "approved",
      null
    )
  })

  it("searches provisions through typos and any word order, best match first, within the filter", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { actions: null, source: noPages })
    const box = screen.getByRole("searchbox", { name: "Search provisions" })
    await user.type(box, "55 years of age")
    const [first] = within(screen.getByRole("list", { name: "Provisions" })).getAllByRole("listitem")
    expect(within(first!).getByRole("list", { name: "Rules citing Declaration 3.1(a)" })).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, "age yeers 55")
    expect(screen.getByRole("list", { name: "Rules citing Declaration 3.1(a)" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Uncovered" }))
    expect(screen.queryByRole("list", { name: "Rules citing Declaration 3.1(a)" })).not.toBeInTheDocument()
  })

  it("shows the rules and terms citing a provision in the list", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { actions: null, source: noPages })
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: "Search provisions" }), "55 years of age")
    const list = screen.getByRole("list", { name: "Rules citing Declaration 3.1(a)" })
    expect(within(list).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Give a reason/ })).not.toBeInTheDocument()
  })
})
