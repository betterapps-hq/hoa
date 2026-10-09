import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { noPages, renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
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
  it("reports the share of the text each kind covers and marks each passage by what covers it", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { actions: null })
    const summary = screen.getByRole("region", { name: /of the documents’ text is covered/ })
    expect(within(summary).getByText("60.4%")).toBeInTheDocument()
    expect(within(summary).getByText(/^All documents: 60.4% covered; Rule 48.8%/)).toBeInTheDocument()
    const legend = within(summary).getByRole("list", { name: "Legend" })
    expect(within(legend).getByText("No rule, reason to review")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Document text", pressed: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Declaration of Covenants/, pressed: true })).toBeInTheDocument()

    const passage = screen.getByRole("button", { name: "Declaration 3.1(a): Rule" })
    expect(passage).toHaveAttribute("aria-pressed", "false")
    expect(screen.getAllByText("55 years", { selector: "mark" }).length).toBeGreaterThan(0)
    await user.click(passage)
    expect(passage).toHaveAttribute("aria-pressed", "true")
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    const rules = within(panel).getByRole("region", { name: /^Rules \(\d+\)$/ })
    expect(
      within(rules).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })
    ).toBeInTheDocument()
    expect(within(rules).getAllByText(/55 years of age or older/).length).toBeGreaterThan(0)
    expect(within(panel).getByRole("region", { name: "Values its rules encode" })).toHaveTextContent("55 years")
    expect(within(panel).getByRole("region", { name: "Provisions that refer to it" })).toBeInTheDocument()
  })

  it("lists the gaps, jumps to one and gives it a reason for having no rule", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab />, { records: withUncovered })
    const gaps = screen.getByRole("region", { name: "1 gap" })
    await user.click(within(gaps).getByRole("button", { name: /^3\.1\(a\): Uncovered/ }))
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    // The sheet is modal, so the text behind it is hidden from the accessibility tree while it's open.
    expect(
      screen.getByRole("button", { name: "Declaration 3.1(a): Uncovered", pressed: true, hidden: true })
    ).toBeInTheDocument()
    expect(within(panel).getByText(/Nothing cites this provision/)).toBeInTheDocument()
    await user.click(within(panel).getByRole("button", { name: "Give a reason for having no rule" }))
    await user.selectOptions(within(panel).getByRole("combobox", { name: "Reason" }), "explanatory")
    await user.click(within(panel).getByRole("button", { name: "Save the reason" }))
    expect(actions?.setNoRule).toHaveBeenCalledWith(uncoveredKey, { reason: "explanatory", note: null })
  })

  it("shows page text outside any provision where its page puts it", async () => {
    const anchored = {
      ...records,
      provisions: records.provisions.map((provision) =>
        provision.key === uncoveredKey
          ? { ...provision, anchors: [{ fileId: "upload", page: 2, start: 0, end: 40 }] }
          : provision
      )
    }
    const source = {
      ...noPages,
      loadSourceText: async () => [
        {
          fileId: "upload",
          skippedPages: [1],
          outside: [{ fileId: "upload", page: 2, start: 60, end: 80, text: "A paragraph no provision holds." }]
        }
      ]
    }
    const { user } = renderInWorkspace(<CoverageTab />, { records: anchored, source })
    const passage = await screen.findByRole("button", { name: "Page 2: Outside any provision" })
    expect(screen.getByText(/1 passage outside any provision/)).toBeInTheDocument()
    expect(
      screen.getByText("Page 1 was read as front matter (a cover or contents) and not counted.")
    ).toBeInTheDocument()
    const row = document.getElementById("coverage-passage-outside:upload:2:60")!
    await user.click(within(row).getByText("A paragraph no provision holds."))
    expect(passage).toHaveAttribute("aria-pressed", "true")
    const panel = await screen.findByRole("dialog", { name: "What covers it" })
    expect(within(panel).getByText(/the build placed it in no provision/)).toBeInTheDocument()
  })

  it("lists uncovered provisions first, and gives one a reason for having no rule", async () => {
    const { user, actions } = renderInWorkspace(<CoverageTab />, { records: withUncovered })
    await user.click(screen.getByRole("button", { name: "Provision list" }))
    expect(screen.getByRole("button", { name: "Uncovered", pressed: true })).toBeInTheDocument()
    const [item] = within(screen.getByRole("list", { name: "Provisions" })).getAllByRole("listitem")
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
    await user.click(screen.getByRole("button", { name: "Provision list" }))
    expect(screen.getByRole("button", { name: "Reasons to review", pressed: true })).toBeInTheDocument()
    const [item] = within(screen.getByRole("list", { name: "Provisions" })).getAllByRole("listitem")
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

  it("shows the rules and terms citing a provision in the list", async () => {
    const { user } = renderInWorkspace(<CoverageTab />, { actions: null })
    await user.click(screen.getByRole("button", { name: "Provision list" }))
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Search provisions" }), "55 years of age")
    const list = screen.getByRole("list", { name: "Rules citing Declaration 3.1(a)" })
    expect(within(list).getByRole("button", { name: "Each occupied Unit has someone 55 or older" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Give a reason/ })).not.toBeInTheDocument()
  })
})
