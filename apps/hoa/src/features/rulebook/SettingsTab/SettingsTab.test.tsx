import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type * as T from "@/schema/types"
import { renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { SettingsTab } from "./SettingsTab"
import { ordinal, percentOf, placeDocument, preconditionOf, shareOf, zoneLabel } from "./SettingsTab.utils"

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
    expect(ranks.slice(0, 3).map((rank) => rank.getAttribute("aria-label"))).toEqual([
      "1st: Federal laws",
      "2nd: State laws",
      "3rd: County ordinances, City ordinances"
    ])
    expect(ranks[3]).toHaveAccessibleName(
      "4th: Declaration (CC&Rs), Supplemental declarations, Plat (the recorded map of the lots)"
    )
    expect(precedence.getByRole("link", { name: "Declaration 1.3, paragraph 3" })).toBeInTheDocument()
    expect(card("Who decides each request").getByText(/decided by the Reviewer/)).toBeInTheDocument()
    expect(card("Deadlines").getByText("US federal holidays")).toBeInTheDocument()
    expect(card("Deadlines").getByText(/^UTC[−+]\d{2}:\d{2} /)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("approves the settings, and ranks a document on its own from its menu", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "settings" }], "approved", null)
    const precedence = card("Which document wins")
    expect(precedence.queryByRole("button", { name: "Drag Federal laws" })).not.toBeInTheDocument()
    expect(precedence.getAllByRole("button", { name: "Law always comes first" })).toHaveLength(3)
    await user.click(precedence.getByRole("button", { name: "Move Declaration (CC&Rs)" }))
    await user.click(await screen.findByRole("menuitem", { name: "Just below its rank now" }))
    expect(actions?.saveSettings).not.toHaveBeenCalled()
    await user.click(precedence.getByRole("button", { name: "Reset" }))
    expect(precedence.getByRole("listitem", { name: /^5th: / })).toHaveAccessibleName("5th: Articles of incorporation")
    await user.click(precedence.getByRole("button", { name: "Move Declaration (CC&Rs)" }))
    await user.click(await screen.findByRole("menuitem", { name: "Just below its rank now" }))
    await user.click(precedence.getByRole("button", { name: "Save the order" }))
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: {
        precedence: expect.objectContaining({
          order: [
            ...records.settings.clauses.precedence.order.slice(0, 3),
            ["supplemental-declaration", "plat"],
            ["declaration"],
            ...records.settings.clauses.precedence.order.slice(4)
          ]
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
    await user.selectOptions(
      card("Deadlines").getByRole("combobox", { name: "Holidays that aren’t business days" }),
      "us-wa"
    )
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: { time: expect.objectContaining({ holidays: "us-wa" }) },
      policy: null
    })
    const zone = card("Deadlines").getByRole("combobox", { name: "Dates and times are in" })
    await user.clear(zone)
    await user.type(zone, "Denver")
    await user.click(await screen.findByRole("option", { name: /\(America\/Denver\)/ }))
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: { time: expect.objectContaining({ zone: "America/Denver" }) },
      policy: null
    })
  })

  it("sets a time to fix a violation and a step before a sanction where the documents give none", async () => {
    const bare = {
      ...records,
      settings: {
        ...records.settings,
        clauses: { ...records.settings.clauses, cure: null, sanctionPreconditions: [] }
      }
    }
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records: bare })
    const cure = card("Time to fix a violation")
    await user.click(cure.getByRole("button", { name: "Set a time to fix a violation" }))
    await user.type(cure.getByRole("spinbutton", { name: "How many" }), "30")
    await user.selectOptions(cure.getByRole("combobox", { name: "Counted from" }), "violation.notice-delivered-on")
    await user.click(cure.getByRole("button", { name: "Save" }))
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: {
        cure: {
          value: 30,
          unit: "calendar-day",
          after: { path: ["violation.notice-delivered-on"] },
          curedBy: null,
          citations: []
        }
      },
      policy: null
    })

    const steps = card("Before a fine or other sanction")
    await user.click(steps.getByRole("button", { name: "Add a step before a sanction" }))
    await user.selectOptions(steps.getByRole("combobox", { name: "For which requests" }), "violation")
    await user.selectOptions(
      steps.getByRole("combobox", { name: "The date needed first" }),
      "violation.hearing-held-on"
    )
    await user.selectOptions(
      steps.getByRole("combobox", { name: "When it's needed" }),
      "violation.hearing-requested-on"
    )
    await user.click(steps.getByRole("button", { name: "Add the step" }))
    expect(actions?.saveSettings).toHaveBeenLastCalledWith({
      clauses: {
        sanctionPreconditions: [
          preconditionOf("violation", "violation.hearing-held-on", "violation.hearing-requested-on")
        ]
      },
      policy: null
    })
  })

  it("sets the recommendations and how sure the review must be, in percent", async () => {
    const { user, actions } = renderInWorkspace(<SettingsTab />, { records })
    const policy = card("Project application reviews")
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
  const order: T.DocumentKind[][] = [
    ["state-law", "county-ordinance"],
    ["declaration"],
    ["rules", "policy", "resolution"]
  ]

  it("ranks a document equal to another rank's, dropping a rank it leaves empty", () => {
    expect(placeDocument(order, "declaration", { type: "rank", index: 2 })).toEqual([
      ["state-law", "county-ordinance"],
      ["rules", "policy", "resolution", "declaration"]
    ])
  })

  it("places a document before or after another, in its rank", () => {
    expect(placeDocument(order, "declaration", { type: "beside", kind: "policy", side: "before" })).toEqual([
      ["state-law", "county-ordinance"],
      ["rules", "declaration", "policy", "resolution"]
    ])
    expect(placeDocument(order, "resolution", { type: "beside", kind: "rules", side: "after" })[2]).toEqual([
      "rules",
      "resolution",
      "policy"
    ])
  })

  it("keeps law at the top: it doesn't move, and nothing goes into or above it", () => {
    expect(placeDocument(order, "state-law", { type: "gap", index: 2 })).toEqual(order)
    expect(placeDocument(order, "declaration", { type: "rank", index: 0 })).toEqual(order)
    expect(placeDocument(order, "declaration", { type: "beside", kind: "county-ordinance", side: "after" })).toEqual(
      order
    )
    expect(placeDocument(order, "policy", { type: "gap", index: 0 })).toEqual(order)
    expect(placeDocument(order, "policy", { type: "gap", index: 1 })[1]).toEqual(["policy"])
  })

  it("ranks a document on its own at a gap", () => {
    expect(placeDocument(order, "policy", { type: "gap", index: 3 })).toEqual([
      ["state-law", "county-ordinance"],
      ["declaration"],
      ["rules", "resolution"],
      ["policy"]
    ])
    expect(placeDocument([["declaration"], ["bylaws"]], "bylaws", { type: "gap", index: 0 })[0]).toEqual(["bylaws"])
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

describe("preconditionOf", () => {
  it("needs a date recorded every time, or only when another one is", () => {
    expect(preconditionOf("violation", "violation.notice-delivered-on", null).condition).toEqual({
      type: "exists",
      from: "request",
      path: ["violation.notice-delivered-on"]
    })
    expect(
      preconditionOf("violation", "violation.hearing-held-on", "violation.hearing-requested-on").condition
    ).toEqual({
      type: "any",
      of: [
        { type: "exists", from: "request", path: ["violation.hearing-held-on"] },
        { type: "not", of: { type: "exists", from: "request", path: ["violation.hearing-requested-on"] } }
      ]
    })
  })
})

describe("zoneLabel", () => {
  it("says a zone's offset from UTC on the day, its name and its city", () => {
    expect(zoneLabel("America/Los_Angeles", new Date("2026-07-01T12:00:00Z"))).toBe(
      "UTC−07:00 Pacific Time (America/Los Angeles)"
    )
    expect(zoneLabel("America/Los_Angeles", new Date("2026-01-01T12:00:00Z"))).toBe(
      "UTC−08:00 Pacific Time (America/Los Angeles)"
    )
    expect(zoneLabel("Asia/Kolkata", new Date("2026-01-01T12:00:00Z"))).toBe(
      "UTC+05:30 India Standard Time (Asia/Kolkata)"
    )
  })
})

describe("percentOf and shareOf", () => {
  it("shows a threshold as a whole percent and keeps it between 0 and 100", () => {
    expect(percentOf(0.8)).toBe(80)
    expect(shareOf(90)).toBe(0.9)
    expect(shareOf(140)).toBe(1)
  })
})
