import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
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

describe("CoverageTab", () => {
  it("lists uncovered provisions first, and gives one a reason for having no rule", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab />, { records: withUncovered })
    expect(screen.getByRole("button", { name: "Uncovered", pressed: true })).toBeInTheDocument()
    const [item] = screen.getAllByRole("listitem")
    expect(within(item!).getByText("Uncovered")).toBeInTheDocument()
    expect(within(item!).getByRole("button", { name: "Declaration 3.1(a)" })).toBeInTheDocument()
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
    const { user, actions } = renderInWorkspace(<CoverageTab />)
    expect(screen.getByRole("button", { name: "Reasons to review", pressed: true })).toBeInTheDocument()
    const [item] = screen.getAllByRole("listitem")
    expect(within(item!).getByText(/^No rule: /)).toBeInTheDocument()
    await user.click(within(item!).getByRole("button", { name: "Approve the reason" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "provision", key: expect.any(String) }], "approved", null)
    await user.click(screen.getByRole("button", { name: "Approve the 246 reasons shown" }))
    await user.click(await screen.findByRole("button", { name: "Approve them" }))
    expect(actions?.review).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: "provision" })]),
      "approved",
      null
    )
  })

  it("shows the rules and terms citing a provision", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { actions: null })
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Search provisions" }), "55 years of age")
    const list = screen.getByRole("list", { name: "Rules citing Declaration 3.1(a)" })
    expect(within(list).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Give a reason/ })).not.toBeInTheDocument()
  })
})
