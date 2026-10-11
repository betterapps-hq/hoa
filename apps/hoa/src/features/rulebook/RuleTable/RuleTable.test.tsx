import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { approvedReview, renderInWorkspace, sampleRecords, sampleWithTermsApproved } from "@/tests/rulebookWorkspace"
import { RuleTable } from "./RuleTable"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const ageRule = "declaration:3.1(a)#age-55-occupant"

/** The table's rows, its header row left out. */
const rulesShown = () =>
  within(screen.getByRole("table", { name: "Rules" }))
    .getAllByRole("row")
    .slice(1)

describe("RuleTable", () => {
  it("lists the draft's rules to review a page at a time, with their statements in words", () => {
    renderInWorkspace(<RuleTable />)
    expect(screen.getByText(/669 rules, all to review/)).toBeInTheDocument()
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
    expect(screen.queryByText("Architectural")).not.toBeInTheDocument()
    expect(rulesShown()).toHaveLength(25)
    expect(screen.getByText("1 to 25 of 669")).toBeInTheDocument()
  })

  it("narrows by words at once, and by kind, area and request type behind Filters", async () => {
    const { user } = renderInWorkspace(<RuleTable />)
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Area" }), "architectural")
    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "norm")
    await user.keyboard("{Escape}")
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "55 or older")
    expect(screen.getByText("No rules match.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(rulesShown()).toHaveLength(25)
  })

  it("finds rules through typos, partial words and any word order, best match first", async () => {
    const { user } = renderInWorkspace(<RuleTable />)
    const box = screen.getByRole("searchbox", { name: "Search rules" })
    await user.type(box, "ocupied unit somone")
    expect(
      within(rulesShown()[0]!).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })
    ).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, "older 55 occup")
    expect(
      within(rulesShown()[0]!).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })
    ).toBeInTheDocument()
  })

  it("combines the words with the filters", async () => {
    const { user } = renderInWorkspace(<RuleTable />)
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "ocupied unit somone")
    expect(screen.getByRole("button", { name: "Each occupied Unit has someone 55 or older" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Kind" }), "norm")
    expect(screen.getByRole("button", { name: "Each occupied Unit has someone 55 or older" })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole("combobox", { name: "Area" }), "architectural")
    expect(screen.getByText("No rules match.")).toBeInTheDocument()
  })

  it("opens a rule from its title, reviews it in its row, and approves the rules shown after confirming", async () => {
    const { user, openRule, actions } = renderInWorkspace(<RuleTable />, { records: sampleWithTermsApproved() })
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "occupied unit someone")
    await user.click(screen.getByRole("button", { name: "Each occupied Unit has someone 55 or older" }))
    expect(openRule).toHaveBeenCalledWith(ageRule)
    await user.click(screen.getByRole("button", { name: "Actions for Each occupied Unit has someone 55 or older" }))
    await user.click(await screen.findByRole("menuitem", { name: "Reject" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: ageRule }], "rejected", null)
    await user.click(screen.getByRole("button", { name: "Approve the 1 rules shown" }))
    await user.click(await screen.findByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: ageRule }], "approved", null)
  })

  it("opens with the status a to-do link asks for, and pages through", async () => {
    const records = sampleRecords()
    const { user } = renderInWorkspace(<RuleTable initialStatus="approved" />, {
      records: { ...records, rules: records.rules.map((rule) => ({ ...rule, review: approvedReview })) }
    })
    expect(screen.getAllByText("Approved")).toHaveLength(25)
    await user.click(screen.getByRole("button", { name: "Next 25 rules" }))
    expect(screen.getByText("26 to 50 of 669")).toBeInTheDocument()
  })

  it("shows the kind and area columns on request, and sorts by them", async () => {
    const { user } = renderInWorkspace(<RuleTable />)
    expect(screen.queryByRole("columnheader", { name: "Area" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Columns" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Area" }))
    await user.keyboard("{Escape}")
    const area = screen.getByRole("columnheader", { name: "Area" })
    expect(area).toHaveAttribute("aria-sort", "none")
    await user.click(within(area).getByRole("button", { name: "Area" }))
    expect(area).toHaveAttribute("aria-sort", "ascending")
    expect(within(rulesShown()[0]!).getByText("Architectural")).toBeInTheDocument()
    await user.click(within(area).getByRole("button", { name: "Area" }))
    expect(area).toHaveAttribute("aria-sort", "descending")
    expect(within(rulesShown()[0]!).queryByText("Architectural")).not.toBeInTheDocument()
  })

  it("is read-only for the published rulebook", () => {
    renderInWorkspace(<RuleTable />, { actions: null })
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("columnheader", { name: "Review" })).not.toBeInTheDocument()
    expect(screen.queryByText("To review")).not.toBeInTheDocument()
  })
})
