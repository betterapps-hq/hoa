import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type * as T from "@/schema/types"
import { renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { SettingsTab } from "./SettingsTab"
import { ordinal, percentOf, placeDocument, shareOf } from "./SettingsTab.utils"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>()
  }
}))

const records = sampleRecords()
function card(title: string) {
  const found = screen.getByText(title, { selector: "[data-slot=card-title]" }).closest("[data-slot=card]")
  if (!(found instanceof HTMLElement)) {
    throw new Error(`No card is titled ${title}.`)
  }
  return within(found)
}

describe("SettingsTab", () => {
  it("reads each setting in plain words, with the passages it comes from", () => {
    renderInWorkspace(<SettingsTab />, { actions: null })
    const precedence = card("Which document wins")
    const ranks = within(precedence.getByRole("list", { name: "Documents in order of authority" })).getAllByRole(
      "listitem"
    )
    expect(ranks[0]).toHaveAccessibleName("1st: State and federal laws, City and county ordinances")
    expect(ranks[1]).toHaveAccessibleName(
      "2nd: Declaration (CC&Rs), Supplemental declarations, Plat (the recorded map of the lots)"
    )
    expect(precedence.getByRole("link", { name: "Declaration 1.3, paragraph 3" })).toBeInTheDocument()
    expect(card("Who decides each request").getByText(/decided by the Reviewer/)).toBeInTheDocument()
    expect(card("Deadlines").getByText("US federal holidays")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("approves the settings, and ranks a document on its own from its menu", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "settings" }], "approved", null)
    const precedence = card("Which document wins")
    expect(precedence.getAllByRole("button", { name: /^Drag / }).length).toBe(
      records.settings.clauses.precedence.order.flat().length
    )
    await user.click(precedence.getByRole("button", { name: "Move City and county ordinances" }))
    await user.click(await screen.findByRole("menuitem", { name: "Just below its rank now" }))
    expect(actions?.saveSettings).not.toHaveBeenCalled()
    await user.click(precedence.getByRole("button", { name: "Reset" }))
    expect(precedence.getByRole("listitem", { name: /^1st: / })).toHaveAccessibleName(
      "1st: State and federal laws, City and county ordinances"
    )
    await user.click(precedence.getByRole("button", { name: "Move City and county ordinances" }))
    await user.click(await screen.findByRole("menuitem", { name: "Just below its rank now" }))
    await user.click(precedence.getByRole("button", { name: "Save the order" }))
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: {
        precedence: expect.objectContaining({
          order: [["statute"], ["ordinance"], ...records.settings.clauses.precedence.order.slice(1)]
        })
      },
      policy: null
    })
  })

  it("changes who decides a request and how deadlines count, as forms", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    const deciders = card("Who decides each request")
    await user.selectOptions(deciders.getAllByRole("combobox", { name: /^Who decides/ })[0]!, "board")
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: { deciders: [expect.objectContaining({ party: "board" })] },
      policy: null
    })
    await user.click(
      card("Deadlines").getByRole("checkbox", {
        name: "A deadline that falls on a weekend or holiday moves to the next business day"
      })
    )
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: { time: expect.objectContaining({ rollForward: !records.settings.clauses.time.rollForward }) },
      policy: null
    })
  })

  it("sets the recommendations and how sure the review must be, in percent", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    const policy = card("Your recommendations")
    await user.selectOptions(
      policy.getByRole("combobox", { name: "If it would take a redesign" }),
      "refer-to-committee"
    )
    const facts = policy.getByRole("spinbutton", { name: /^Use a detail read from an application/ })
    expect(facts).toHaveValue(percentOf(records.settings.policy.thresholds.factConfidence))
    await user.clear(facts)
    await user.type(facts, "90")
    await user.click(policy.getByRole("button", { name: "Save" }))
    expect(actions?.saveSettings).toHaveBeenCalledWith({
      clauses: {},
      policy: {
        decisionPolicy: { ...records.settings.policy.decisionPolicy, redesign: "refer-to-committee" },
        thresholds: { ...records.settings.policy.thresholds, factConfidence: 0.9 }
      }
    })
  })
})

describe("placeDocument", () => {
  const order: T.DocumentKind[][] = [["statute", "ordinance"], ["declaration"], ["rules", "policy", "resolution"]]

  it("ranks a document equal to another rank's, dropping a rank it leaves empty", () => {
    expect(placeDocument(order, "declaration", { type: "rank", index: 0 })).toEqual([
      ["statute", "ordinance", "declaration"],
      ["rules", "policy", "resolution"]
    ])
  })

  it("places a document before or after another, in its rank", () => {
    expect(placeDocument(order, "declaration", { type: "beside", kind: "policy", side: "before" })).toEqual([
      ["statute", "ordinance"],
      ["rules", "declaration", "policy", "resolution"]
    ])
    expect(placeDocument(order, "resolution", { type: "beside", kind: "rules", side: "after" })[2]).toEqual([
      "rules",
      "resolution",
      "policy"
    ])
  })

  it("ranks a document on its own at a gap", () => {
    expect(placeDocument(order, "policy", { type: "gap", index: 3 })).toEqual([
      ["statute", "ordinance"],
      ["declaration"],
      ["rules", "resolution"],
      ["policy"]
    ])
    expect(placeDocument(order, "resolution", { type: "gap", index: 0 })[0]).toEqual(["resolution"])
  })
})

describe("ordinal", () => {
  it("says a rank as people do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd"
    ])
  })
})

describe("percentOf and shareOf", () => {
  it("shows a threshold as a whole percent and keeps it between 0 and 100", () => {
    expect(percentOf(0.8)).toBe(80)
    expect(shareOf(90)).toBe(0.9)
    expect(shareOf(140)).toBe(1)
  })
})
