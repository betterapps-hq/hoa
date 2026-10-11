import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { approvedReview, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { VocabularyTab } from "./VocabularyTab"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

/** The table's rows, its header row left out. */
const termsShown = () =>
  within(screen.getByRole("table", { name: "Terms" }))
    .getAllByRole("row")
    .slice(1)

describe("VocabularyTab", () => {
  it("lists the terms to review with their kind, definition and where they're used", async () => {
    const { user, openRule } = renderInWorkspace(<VocabularyTab />)
    expect(screen.getByText(/^892 terms/)).toBeInTheDocument()
    expect(termsShown()).toHaveLength(25)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "premises leased")
    const term = termsShown().find((item) => within(item).queryByText(/^A property of lease registration/))
    await user.click(within(term!).getByRole("button", { name: /used by \d+ rules?/ }))
    const rules = screen.getByRole("list", { name: "Rules using premises leased" })
    // The first button of a rule link is its title, which opens the rule.
    await user.click(within(rules).getAllByRole("button")[0]!)
    expect(openRule).toHaveBeenCalledWith(expect.stringMatching(/^declaration:/))
  })

  it("finds a term through a typo, a partial word and any word order, best match first", async () => {
    const { user } = renderInWorkspace(<VocabularyTab />)
    const box = screen.getByRole("searchbox", { name: "Search terms" })
    for (const query of ["leased premisses", "premis lea"]) {
      await user.clear(box)
      await user.type(box, query)
      expect(screen.getByText(/^5 of 892 terms/)).toBeInTheDocument()
      expect(within(termsShown()[0]!).getByRole("button", { name: "Actions for Leased premises" })).toBeInTheDocument()
      expect(screen.getByText(/^A property of lease registration/)).toBeInTheDocument()
    }
  })

  it("filters by kind behind Filters, and approves or rejects a term", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "premises leased")
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Kind" }), "unit")
    expect(screen.getByText("No terms match.")).toBeInTheDocument()
    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "property")
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Actions for Premises leased" }))
    await user.click(await screen.findByRole("menuitem", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith(
      [{ type: "term", key: "lease-registration.premises" }],
      "approved",
      null
    )
    await user.click(screen.getByRole("button", { name: "Actions for Premises leased" }))
    await user.click(await screen.findByRole("menuitem", { name: "Reject" }))
    expect(actions?.review).toHaveBeenCalledWith(
      [{ type: "term", key: "lease-registration.premises" }],
      "rejected",
      null
    )
  })

  it("sorts by how many rules use a term, most first", async () => {
    const { user } = renderInWorkspace(<VocabularyTab />)
    const usedBy = screen.getByRole("columnheader", { name: "Used by" })
    await user.click(within(usedBy).getByRole("button", { name: "Used by" }))
    expect(usedBy).toHaveAttribute("aria-sort", "descending")
    const counts = termsShown().map((row) =>
      Number.parseInt(within(row).queryByRole("button", { name: /: used by/ })?.textContent ?? "0", 10)
    )
    expect(counts).toEqual(counts.toSorted((a, b) => b - a))
    expect(counts[0]).toBeGreaterThan(1)
  })

  it("approves every term shown", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "lease-registration.")
    await user.click(screen.getByRole("button", { name: /^Approve the \d+ terms shown$/ }))
    await user.click(await screen.findByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenCalledWith(
      expect.arrayContaining([{ type: "term", key: "lease-registration.premises" }]),
      "approved",
      null
    )
  })

  it("shows approved terms read-only for the published rulebook", () => {
    const records = sampleRecords()
    renderInWorkspace(<VocabularyTab />, {
      actions: null,
      records: { ...records, terms: records.terms.map((term) => ({ ...term, review: approvedReview })) }
    })
    expect(screen.queryByText("Approved")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument()
  })
})
