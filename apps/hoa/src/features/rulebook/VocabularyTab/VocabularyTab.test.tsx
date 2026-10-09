import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { approvedReview, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { VocabularyTab } from "./VocabularyTab"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const termsShown = () => within(screen.getByRole("list", { name: "Terms" })).getAllByRole("listitem")

describe("VocabularyTab", () => {
  it("lists the terms to review with their kind, definition and where they're used", async () => {
    const { user, openRule } = renderInWorkspace(<VocabularyTab />)
    expect(screen.getByText(/^577 terms/)).toBeInTheDocument()
    expect(termsShown()).toHaveLength(25)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "premises leased")
    const [term] = termsShown()
    expect(within(term!).getByText(/^A property of lease registration/)).toBeInTheDocument()
    await user.click(within(term!).getByRole("button", { name: /used by \d+ rules?/ }))
    const rules = screen.getByRole("list", { name: "Rules using premises leased" })
    // The first button of a rule link is its title, which opens the rule.
    await user.click(within(rules).getAllByRole("button")[0]!)
    expect(openRule).toHaveBeenCalledWith(expect.stringMatching(/^declaration:/))
  })

  it("filters by kind behind Filters, and approves or rejects a term", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "premises leased")
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Kind" }), "unit")
    expect(screen.getByText("No terms match.")).toBeInTheDocument()
    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "property")
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Approve premises leased" }))
    expect(actions?.review).toHaveBeenCalledWith(
      [{ type: "term", key: "lease-registration.premises" }],
      "approved",
      null
    )
    await user.click(screen.getByRole("button", { name: "Reject premises leased" }))
    expect(actions?.review).toHaveBeenCalledWith(
      [{ type: "term", key: "lease-registration.premises" }],
      "rejected",
      null
    )
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
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument()
  })
})
