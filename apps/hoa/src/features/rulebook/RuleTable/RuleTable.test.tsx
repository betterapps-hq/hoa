import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { approvedReview, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { RuleTable } from "./RuleTable"

const ageRule = "declaration:3.1(a)#age-55-occupant"

function rowsShown() {
  return screen.getAllByRole("row").slice(1)
}

describe("RuleTable", () => {
  it("lists the draft's rules to review with their titles, citations and statements in words", () => {
    renderInWorkspace(<RuleTable />)
    expect(screen.getByText(/Showing 50 of 307 matching rules/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "To review", pressed: true })).toBeInTheDocument()
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
    expect(rowsShown()).toHaveLength(50)
  })

  it("filters by domain, kind, request type and words", async () => {
    const { user } = renderInWorkspace(<RuleTable />)
    await user.selectOptions(screen.getByRole("combobox", { name: "Domain" }), "architectural")
    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "norm")
    await user.selectOptions(screen.getByRole("combobox", { name: "Request type" }), "violation")
    expect(rowsShown().every((row) => within(row).queryByText("Architectural") !== null)).toBe(true)
    await user.type(screen.getByRole("textbox", { name: "Search rules" }), "55 or older")
    expect(screen.getByText(/Showing 0 of 0/)).toBeInTheDocument()
    expect(screen.getByText("No rules match.")).toBeInTheDocument()
  })

  it("opens a rule from its title, and approves the rules shown after confirming", async () => {
    const { user, openRule, actions } = renderInWorkspace(<RuleTable />)
    await user.type(screen.getByRole("textbox", { name: "Search rules" }), "55 or older")
    await user.click(screen.getByRole("button", { name: "Each occupied Unit has someone 55 or older" }))
    expect(openRule).toHaveBeenCalledWith(ageRule)
    await user.click(screen.getByRole("button", { name: "Approve the 1 rules shown" }))
    await user.click(await screen.findByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: ageRule }], "approved", null)
  })

  it("shows more rules on request and switches status", async () => {
    const records = sampleRecords()
    const { user } = renderInWorkspace(<RuleTable />, {
      records: { ...records, rules: records.rules.map((rule) => ({ ...rule, review: approvedReview })) }
    })
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show 50 more" }))
    expect(rowsShown()).toHaveLength(100)
    await user.click(screen.getByRole("button", { name: "Rejected" }))
    expect(screen.getByText("No rules match.")).toBeInTheDocument()
  })

  it("is read-only for the published rulebook", () => {
    renderInWorkspace(<RuleTable />, { actions: null })
    expect(screen.queryByRole("group", { name: "Review status" })).not.toBeInTheDocument()
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument()
  })
})
