import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { approvedReview, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { VocabularyTab } from "./VocabularyTab"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

/** A subject's button, which opens it, described by what it holds. */
const subject = (name: string) => screen.getByRole("button", { name })

describe("VocabularyTab", () => {
  it("groups the terms under what they describe, most used first", () => {
    renderInWorkspace(<VocabularyTab />)
    expect(screen.getByText(/^All 1096 terms to review/)).toBeInTheDocument()
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(headings.slice(0, 5)).toEqual(["Things", "Requests", "People and organizations", "Events", "Documents"])
    const things = within(screen.getByRole("list", { name: "Things" }))
    expect(things.getByRole("button", { name: "Fence run" })).toHaveAccessibleDescription(/^\d+ questions and 3 kinds$/)
    expect(screen.getByRole("button", { name: /^Show all \d+ things$/ })).toBeInTheDocument()
  })

  it("opens a subject to its kinds and details, each detail with its choices", async () => {
    const { user } = renderInWorkspace(<VocabularyTab />)
    await user.click(subject("Fence run"))
    const details = within(screen.getByRole("region", { name: "Questions about fence run" }))
    expect(details.getByText("Material")).toBeInTheDocument()
    for (const choice of ["Wood", "Composite", "Metal", "Vinyl"]) {
      expect(details.getAllByRole("button", { name: choice }).length).toBeGreaterThan(0)
    }
    // A detail choosing from a list shown above refers back to it instead of repeating it.
    expect(details.getAllByText(", as for material").length).toBeGreaterThan(0)
    expect(within(screen.getByRole("region", { name: "Kinds of fence run" })).getByText("Boundary fence")).toBeVisible()

    // A detail drops the subject's name it repeats: "gate height" under gate is "Height".
    await user.click(screen.getByRole("button", { name: /^Show all \d+ things$/ }))
    await user.click(subject("Gate"))
    expect(within(screen.getByRole("region", { name: "Questions about gate" })).getByText("Height")).toBeInTheDocument()
  })

  it("finds a term through a typo, a partial word and any word order, with the subject it's under", async () => {
    const { user, openRule } = renderInWorkspace(<VocabularyTab />)
    const box = screen.getByRole("searchbox", { name: "Search terms" })
    for (const query of ["leased premisses", "premis lea"]) {
      await user.clear(box)
      await user.type(box, query)
      expect(screen.getByRole("heading", { name: "Best matches" })).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "Questions about lease registration" })).toBeInTheDocument()
    }
    await user.click(screen.getByRole("button", { name: /^Premises leased: asked by \d+ rules?$/ }))
    const rules = screen.getByRole("list", { name: "Rules using Premises leased" })
    // The first button of a rule link is its title, which opens the rule.
    await user.click(within(rules).getAllByRole("button")[0]!)
    expect(openRule).toHaveBeenCalledWith(expect.stringMatching(/^declaration:/))
  })

  it("marks a found choice and opens what it means, with its review", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "vinyl")
    const [vinyl] = screen.getAllByRole("button", { name: "Vinyl" })
    expect(vinyl).toHaveClass("border-primary")
    await user.click(vinyl!)
    const popover = within(await screen.findByRole("dialog", { name: "Vinyl" }))
    expect(popover.getByText("One of the fence materials")).toBeInTheDocument()
    await user.click(popover.getByRole("button", { name: "Approve Vinyl" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "term", key: "fence-material.vinyl" }], "approved", null)
  })

  it("approves or rejects one term from its menu", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.type(screen.getByRole("searchbox", { name: "Search terms" }), "premises leased")
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

  it("approves a subject with its details and their choices together", async () => {
    const { user, actions } = renderInWorkspace(<VocabularyTab />)
    await user.click(subject("Fence run"))
    await user.click(screen.getByRole("button", { name: /^Approve all \d+ terms$/ }))
    expect(
      await screen.findByRole("alertdialog", { name: /^Approve the \d+ terms for Fence run, its questions/ })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenCalledWith(
      expect.arrayContaining([
        { type: "term", key: "fence-run" },
        { type: "term", key: "fence-run.material" },
        { type: "term", key: "fence-material.vinyl" }
      ]),
      "approved",
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

  it("filters by review behind Filters", async () => {
    const records = sampleRecords()
    const { user } = renderInWorkspace(<VocabularyTab />, {
      records: {
        ...records,
        terms: records.terms.map((term) => (term.key === "gate.height" ? { ...term, review: approvedReview } : term))
      }
    })
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Review" }), "approved")
    await user.keyboard("{Escape}")
    expect(screen.getByText(/^1 of 1096 terms approved/)).toBeInTheDocument()
    expect(subject("Gate")).toHaveAccessibleDescription(/^1 of \d+ questions$/)
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(screen.getByText(/^1095 of 1096 terms to review/)).toBeInTheDocument()
  })

  it("shows approved terms read-only for the published rulebook", () => {
    const records = sampleRecords()
    renderInWorkspace(<VocabularyTab />, {
      actions: null,
      records: { ...records, terms: records.terms.map((term) => ({ ...term, review: approvedReview })) }
    })
    expect(screen.getByText("1096 terms, grouped by what they describe")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument()
  })
})
