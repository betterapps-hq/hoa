import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Rule } from "@/rules/rules"
import { fenceRules } from "@/tests/fixtures"
import { RulebookEditor } from "./RulebookEditor"

function renderEditor(onPublish = vi.fn<(rules: Rule[]) => Promise<void>>(async () => undefined)) {
  render(
    <RulebookEditor
      hoaName="Sample Ridge HOA"
      documents={["CC&Rs.pdf", "Design Guidelines.pdf"]}
      rules={fenceRules}
      onPublish={onPublish}
    />
  )
  return onPublish
}

function ruleCard(title: string) {
  return screen.getByRole("group", { name: title })
}

describe("RulebookEditor", () => {
  it("starts with every rule waiting for a decision and publishing disabled", () => {
    renderEditor()

    expect(screen.getByText("0 approved")).toBeInTheDocument()
    expect(screen.getByText("0 rejected")).toBeInTheDocument()
    expect(screen.getByText("3 waiting for a decision")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publish 0 approved rules" })).toBeDisabled()
    expect(within(ruleCard("Fence height")).getByLabelText("Requirement")).toHaveValue(
      "Boundary fences are 40 to 72 inches tall."
    )
  })

  it("publishes only approved rules, with the rep's edits", async () => {
    const onPublish = renderEditor()
    const colors = ruleCard("Composite fence colors")
    await userEvent.clear(within(colors).getByLabelText("Requirement"))
    await userEvent.type(within(colors).getByLabelText("Requirement"), "Trex fences are Winchester Grey or Saddle.")
    await userEvent.click(within(colors).getByRole("button", { name: "Approve" }))
    await userEvent.click(within(ruleCard("Fence height")).getByRole("button", { name: "Reject" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 1 approved rules" }))

    expect(onPublish).toHaveBeenCalledWith([
      { ...fenceRules[0], requirement: "Trex fences are Winchester Grey or Saddle." }
    ])
  })

  it("approves the remaining rules at once", async () => {
    const onPublish = renderEditor()
    await userEvent.click(within(ruleCard("Fence height")).getByRole("button", { name: "Reject" }))
    await userEvent.click(screen.getByRole("button", { name: "Approve remaining rules" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 2 approved rules" }))

    expect(onPublish).toHaveBeenCalledWith([fenceRules[0], fenceRules[2]])
  })

  it("adds and deletes rules, and blocks publishing an incomplete rule", async () => {
    const onPublish = renderEditor()
    await userEvent.click(
      within(ruleCard("Approved composite manufacturers")).getByRole("button", { name: "Delete rule" })
    )
    await userEvent.click(screen.getByRole("button", { name: "Add a rule" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 1 approved rules" }))

    expect(screen.queryByRole("group", { name: "Approved composite manufacturers" })).not.toBeInTheDocument()
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument()
    expect(screen.getByText(/Some rules have missing fields./)).toBeInTheDocument()
    expect(screen.getAllByLabelText("Title").at(-1)).toHaveAttribute("aria-invalid", "true")
    expect(onPublish).not.toHaveBeenCalled()
  })

  it("shows an error when publishing fails", async () => {
    renderEditor(vi.fn<(rules: Rule[]) => Promise<void>>(async () => Promise.reject(new Error("Disk full"))))
    await userEvent.click(screen.getByRole("button", { name: "Approve remaining rules" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 3 approved rules" }))

    expect(await screen.findByText("Disk full")).toBeInTheDocument()
  })

  it("edits a rule's page number and project types", async () => {
    const onPublish = renderEditor()
    const height = ruleCard("Fence height")
    await userEvent.clear(within(height).getByLabelText("Page"))
    await userEvent.click(within(height).getByRole("checkbox", { name: "Fence" }))
    await userEvent.click(within(height).getByRole("checkbox", { name: "Fence" }))
    await userEvent.click(within(height).getByRole("button", { name: "Approve" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 1 approved rules" }))

    expect(onPublish).toHaveBeenCalledWith([{ ...fenceRules[1], source: { ...fenceRules[1]!.source, page: null } }])
  })
})
