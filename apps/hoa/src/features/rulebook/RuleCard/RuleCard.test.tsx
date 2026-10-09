import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type * as T from "@/schema/types"
import { renderInWorkspace, ruleIn, sampleRecords, sampleWithTermsApproved } from "@/tests/rulebookWorkspace"
import { RuleCard } from "./RuleCard"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const approvalRule = "declaration:4.1/p1#approval-required"

function renderCard(records = sampleWithTermsApproved(), key = approvalRule, actions?: null) {
  const onDeleted = vi.fn<() => void>()
  const rendered = renderInWorkspace(<RuleCard rule={ruleIn(records, key)} onDeleted={onDeleted} />, {
    records,
    ...(actions === null ? { actions: null } : {})
  })
  return { ...rendered, onDeleted }
}

const section = (name: string) => screen.getByRole("region", { name })

describe("RuleCard", () => {
  it("reads the rule: its statement, its meaning in the schema's words, who it binds and its citations", () => {
    renderCard()
    expect(within(section("Statement")).getByRole("button", { name: "Work" })).toBeInTheDocument()
    expect(section("In the schema’s words")).toHaveTextContent(
      /must ensure, for each Work, that it was approved by the/
    )
    expect(screen.getByText("Must (an obligation)")).toBeInTheDocument()
    expect(screen.getByText("Bearer").nextElementSibling).toHaveTextContent("Owner")
    expect(screen.getByText("Remedy").nextElementSibling).toHaveTextContent("Redesign")
    expect(within(section("Citations")).getAllByRole("button", { name: "View in document" })).toHaveLength(5)
  })

  it("links the rules that override and enforce it", () => {
    renderCard()
    expect(
      within(section("Overridden by")).getByRole("button", {
        name: "Repainting in approved colors and interior work need no approval"
      })
    ).toBeInTheDocument()
    expect(within(section("Enforced by")).getAllByRole("listitem").length).toBeGreaterThan(0)
  })

  it("approves, rejects and deletes", async () => {
    const { user, actions, onDeleted } = renderCard()
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "approved", null)
    await user.click(screen.getByRole("button", { name: "Reject" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "rejected", null)
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }))
    expect(actions?.removeRule).toHaveBeenCalledWith(approvalRule)
    expect(onDeleted).toHaveBeenCalled()
  })

  it("says why it can't be approved yet", () => {
    renderCard(sampleRecords())
    expect(screen.getByText(/It reads terms still to review/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
  })

  it("shows issues, resolves one with a note, and lists what validation finds", async () => {
    const records = sampleWithTermsApproved()
    const issue: T.Issue = { code: "conflict", message: "Conflicts with 4.2", related: [], resolution: null }
    const broken = {
      ...records,
      rules: records.rules.map((rule) =>
        rule.key === approvalRule ? { ...rule, bearer: "gazebo", issues: [issue] } : rule
      )
    }
    const { user, actions } = renderCard(broken)
    const issues = section("Issues")
    expect(within(issues).getByText("gazebo isn't a term")).toBeInTheDocument()
    expect(within(issues).getByText("Blocks approval")).toBeInTheDocument()
    await user.click(within(issues).getByRole("button", { name: "Resolve" }))
    await user.type(within(issues).getByRole("textbox", { name: "Why it’s resolved" }), "4.2 is narrower.")
    await user.click(within(issues).getByRole("button", { name: "Save the note" }))
    expect(actions?.resolveIssue).toHaveBeenCalledWith({ type: "rule", key: approvalRule }, 0, "4.2 is narrower.")
  })

  it("switches to the form and the JSON editor, and saves through them", async () => {
    const { user, actions } = renderCard()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.clear(screen.getByRole("textbox", { name: "Title" }))
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Work needs approval first")
    await user.click(screen.getByRole("button", { name: "Save the rule" }))
    expect(actions?.saveRule).toHaveBeenCalledWith(expect.objectContaining({ title: "Work needs approval first" }))
    await user.click(await screen.findByRole("button", { name: "Edit as JSON" }))
    expect(screen.getByRole("textbox", { name: "The rule as JSON" })).toHaveDisplayValue(
      /"key": "declaration:4\.1\/p1#approval-required"/
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("region", { name: "Statement" })).toBeInTheDocument()
  })

  it("is read-only for the published rulebook", () => {
    renderCard(sampleWithTermsApproved(), approvalRule, null)
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  })
})
