import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { SettingsTab } from "./SettingsTab"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const records = sampleRecords()
function card(title: string) {
  const found = screen.getByText(title, { selector: "[data-slot=card-title]" }).closest("[data-slot=card]")
  if (!(found instanceof HTMLElement)) {
    throw new Error(`No card is titled ${title}.`)
  }
  return found
}

describe("SettingsTab", () => {
  it("reads each clause in words, with its citations", () => {
    renderInWorkspace(<SettingsTab />, { actions: null })
    const precedence = card("Which document wins")
    expect(precedence).toHaveTextContent("1. statute, ordinance")
    expect(within(precedence).getByRole("link", { name: "Declaration 1.3, paragraph 3" })).toBeInTheDocument()
    expect(card("Who decides each request")).toHaveTextContent("The Reviewer decides applications.")
    expect(card("Days and time")).toHaveTextContent("Holidays follow the us-federal calendar")
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument()
  })

  it("approves the settings and edits a clause as JSON, checked as it's typed", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "settings" }], "approved", null)

    await user.click(screen.getByRole("button", { name: "Edit Who decides each request" }))
    const editor = screen.getByRole("textbox", { name: "Who decides each request as JSON" })
    const deciders = [{ requestType: "architectural-application", party: "gazebo", citations: [] }]
    fireEvent.change(editor, { target: { value: JSON.stringify(deciders) } })
    expect(await screen.findByText("gazebo isn't a term")).toBeInTheDocument()
    fireEvent.change(editor, { target: { value: JSON.stringify([{ ...deciders[0], party: "board" }]) } })
    expect(await screen.findByText("No problems found.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save the clause" }))
    expect(actions?.saveSettings).toHaveBeenCalledWith({
      clauses: expect.objectContaining({
        deciders: [{ requestType: "architectural-application", party: "board", citations: [] }]
      }),
      policy: null
    })
  })

  it("edits the policy", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Not met, fixed by: redesign" }),
      "refer-to-committee"
    )
    await user.click(screen.getByRole("button", { name: "Save the policy" }))
    expect(actions?.saveSettings).toHaveBeenCalledWith({
      clauses: {},
      policy: {
        ...records.settings.policy,
        decisionPolicy: { ...records.settings.policy.decisionPolicy, redesign: "refer-to-committee" }
      }
    })
  })
})
