import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type * as T from "@/schema/types"
import {
  approvedReview,
  renderInWorkspace,
  ruleIn,
  sampleRecords,
  sampleWithTermsApproved
} from "@/tests/rulebookWorkspace"
import { RuleCard } from "./RuleCard"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const approvalRule = "declaration:4.1/p1#approval-required"
const notifyRule = "declaration:3.1(c)/p3#notify-board"

function renderCard(records = sampleWithTermsApproved(), key = approvalRule, actions?: null) {
  return renderInWorkspace(<RuleCard rule={ruleIn(records, key)} />, {
    records,
    ...(actions === null ? { actions: null } : {})
  })
}

const section = (name: string) => screen.getByRole("region", { name })

describe("RuleCard", () => {
  it("reads the rule: its statement and sources first, its details on request", async () => {
    const { user } = renderCard()
    expect(within(section("Statement")).getByRole("button", { name: "Work" })).toBeInTheDocument()
    expect(within(section("Sources")).getByRole("list", { name: "Also cited" }).children).toHaveLength(4)
    expect(screen.queryByText("Bearer")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "What it says, in detail" }))
    expect(await screen.findByText("Must (an obligation)")).toBeInTheDocument()
    expect(screen.getByText("Must (an obligation)").closest("[data-slot=accordion-content]")).toHaveTextContent(
      /must ensure, for each Work, that it was approved by the/
    )
    expect(screen.getByText("Must (an obligation)")).toBeInTheDocument()
    expect(screen.getByText("Bearer").nextElementSibling).toHaveTextContent("Owner")
    expect(screen.getByText("Remedy").nextElementSibling).toHaveTextContent("Redesign")
  })

  it("links the rules that override and enforce it", async () => {
    const { user } = renderCard()
    await user.click(screen.getByRole("button", { name: "What it says, in detail" }))
    expect(
      within(section("Overridden by")).getByRole("button", {
        name: "Repainting in approved colors and interior work need no approval"
      })
    ).toBeInTheDocument()
    expect(within(section("Enforced by")).getAllByRole("listitem").length).toBeGreaterThan(0)
  })

  it("approves first, with reject and edit as quieter actions, and no delete", async () => {
    const { user, actions } = renderCard()
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit as JSON" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "approved", null)
    await user.click(screen.getByRole("button", { name: "Reject" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "rejected", null)
  })

  it("says a decided rule is approved, in words, with a way to undo it", async () => {
    const records = sampleWithTermsApproved()
    const approved = {
      ...records,
      rules: records.rules.map((rule) => (rule.key === approvalRule ? { ...rule, review: approvedReview } : rule))
    }
    const { user, actions } = renderCard(approved)
    expect(screen.getByText("Approved")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "proposed", null)
  })

  it("approves the terms it uses still to review with it, and lists them with how many rules share each", async () => {
    const { user, actions } = renderCard(sampleRecords())
    const terms = within(screen.getByRole("list", { name: "Terms it uses" })).getAllByRole("listitem")
    expect(within(terms[0]!).getByText("To review")).toBeInTheDocument()
    expect(within(terms[0]!).getByText(/^Used in \d+ rules$|^Only this rule$/)).toBeInTheDocument()
    expect(screen.getByText(/^Approving the rule approves the \d+ still to review\./)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^Approve, with its \d+ terms$/ }))
    expect(actions?.review).toHaveBeenCalledWith([{ type: "rule", key: approvalRule }], "approved", null)
  })

  it("has the rule use a different term that fits, in this rule only", async () => {
    const { user, actions } = renderCard(sampleWithTermsApproved(), notifyRule)
    await user.click(screen.getByRole("button", { name: "Actions for Board notified on" }))
    // Only this rule uses the term, so a copy for it would change nothing.
    expect(screen.queryByRole("menuitem", { name: "Use a new term here" })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("menuitem", { name: "Use a different term here" }))
    const dialog = await screen.findByRole("dialog", { name: "Use a different term in this rule" })
    expect(within(dialog).getByText(/In place of “Board notified on”, in this rule only\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("combobox", { name: "Term" }))
    await user.click(await screen.findByRole("option", { name: /^Lease signed on/ }))
    await user.click(within(dialog).getByRole("button", { name: "Use it" }))
    expect(actions?.changeRuleTerm).toHaveBeenCalledWith(notifyRule, "lease-registration.reported-on", {
      type: "term",
      key: "lease-registration.signed-on"
    })
  })

  it("makes a new term for the rule from a copy, named apart from the one it copies", async () => {
    const { user, actions } = renderCard(sampleWithTermsApproved(), notifyRule)
    await user.click(screen.getByRole("button", { name: "Actions for Owner" }))
    await user.click(await screen.findByRole("menuitem", { name: "Use a new term here" }))
    const dialog = await screen.findByRole("dialog", { name: "A new term for this rule" })
    expect(within(dialog).getByText(/^It starts as a copy of “Owner”\. Only this rule uses it\./)).toBeInTheDocument()
    const name = within(dialog).getByRole("textbox", { name: "Name" })
    await user.type(name, "owner")
    await user.click(within(dialog).getByRole("button", { name: "Make the term" }))
    expect(await within(dialog).findByText("Give it a name that tells it apart from “Owner”.")).toBeInTheDocument()
    await user.clear(name)
    await user.type(name, "Unit owner")
    await user.click(within(dialog).getByRole("button", { name: "Make the term" }))
    expect(actions?.changeRuleTerm).toHaveBeenCalledWith(notifyRule, "owner", {
      type: "copy",
      label: "Unit owner",
      definition: expect.toBeOneOf([expect.any(String), null])
    })
  })

  it("says why it can't be approved yet", () => {
    const records = sampleWithTermsApproved()
    const issue: T.Issue = { code: "conflict", message: "Conflicts with 4.2", related: [], resolution: null }
    renderCard({
      ...records,
      rules: records.rules.map((rule) => (rule.key === approvalRule ? { ...rule, issues: [issue] } : rule))
    })
    expect(screen.getByText("1 open issue needs resolving.")).toBeInTheDocument()
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
    const issues = section("Problems")
    expect(within(issues).getByText("gazebo isn't a term")).toBeInTheDocument()
    expect(within(issues).getByText("Blocks approval")).toBeInTheDocument()
    await user.click(within(issues).getByRole("button", { name: "Resolve" }))
    await user.type(within(issues).getByRole("textbox", { name: "Why it’s resolved" }), "4.2 is narrower.")
    await user.click(within(issues).getByRole("button", { name: "Save the note" }))
    expect(actions?.resolveIssue).toHaveBeenCalledWith({ type: "rule", key: approvalRule }, 0, "4.2 is narrower.")
  })

  it("switches to the form and saves through it", async () => {
    const { user, actions } = renderCard()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.clear(screen.getByRole("textbox", { name: "Title" }))
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Work needs approval first")
    await user.click(screen.getByRole("button", { name: "Save the rule" }))
    expect(actions?.saveRule).toHaveBeenCalledWith(expect.objectContaining({ title: "Work needs approval first" }))
    expect(await screen.findByRole("region", { name: "Statement" })).toBeInTheDocument()
  })

  it("is read-only for the published rulebook", () => {
    renderCard(sampleWithTermsApproved(), approvalRule, null)
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  })
})
