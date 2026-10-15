import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RuleDraft } from "@/schema/zod"
import { renderInWorkspace, ruleIn, sampleWithTermsApproved } from "@/tests/rulebookWorkspace"
import { RuleForm } from "./RuleForm"

const records = sampleWithTermsApproved()
const leaseRule = ruleIn(records, "declaration:3.1(c)/p2#minimum-term")

function setup(rule = leaseRule) {
  const onSave = vi.fn<(draft: RuleDraft) => Promise<void>>(async () => undefined)
  const onCancel = vi.fn<() => void>()
  const rendered = renderInWorkspace(<RuleForm rule={rule} onSave={onSave} onCancel={onCancel} />, { records })
  return { ...rendered, onSave, onCancel }
}

describe("RuleForm", () => {
  it("starts from the rule's fields and its check", () => {
    setup()
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(leaseRule.title)
    expect(screen.getByRole("combobox", { name: "Modality" })).toHaveValue("obligation")
    expect(within(screen.getByRole("list", { name: "Bearer" })).getByText("Owner")).toBeInTheDocument()
    const requestTypes = within(screen.getByRole("list", { name: "Request types" }))
    expect(requestTypes.getByRole("button", { name: "Remove lease registration" })).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Applies to" })).getByText("lease registration")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Complies when: comparison" })).toHaveValue(">=")
  })

  it("validates live: a missing title and a bearer a norm needs", async () => {
    const { user } = setup()
    await user.clear(screen.getByRole("textbox", { name: "Title" }))
    expect(await screen.findByText("Give the rule a title.")).toBeInTheDocument()
    await user.click(within(screen.getByRole("list", { name: "Bearer" })).getByRole("button", { name: "Remove Owner" }))
    expect(await screen.findAllByText("a requirement has no bearer, and every other norm has one")).not.toHaveLength(0)
    expect(screen.getByRole("button", { name: "Save the rule" })).toBeDisabled()
  })

  it("shows problems the rest of the rulebook finds, and the statement in words", async () => {
    const { user } = setup()
    await user.type(screen.getByRole("textbox", { name: "Statement" }), " A {{{{gazebo}} too.")
    expect(await screen.findByText("gazebo isn't a term", {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByTitle("gazebo isn't a term")).toBeInTheDocument()
  })

  it("saves the edited rule with its check, and cancels", async () => {
    const { user, onSave, onCancel } = setup()
    await user.selectOptions(screen.getByRole("combobox", { name: "Complies when: comparison" }), ">")
    await user.selectOptions(screen.getByRole("combobox", { name: "Remedy" }), "change-detail")
    await user.click(screen.getByRole("button", { name: "Save the rule" }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        key: leaseRule.key,
        remedy: "change-detail",
        check: expect.objectContaining({ test: expect.objectContaining({ op: ">" }) })
      })
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("picks a term with the keyboard without submitting the form", async () => {
    const { user, onSave } = setup()
    await user.type(screen.getByRole("combobox", { name: "Add to Request types" }), "violation")
    await user.keyboard("{ArrowDown}{Enter}")
    expect(await screen.findByRole("button", { name: "Remove violation" })).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("adds and removes an applicability condition", async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole("checkbox", { name: "Only when a condition holds" }))
    expect(screen.getByRole("group", { name: "Applies when" })).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Only when a condition holds" }))
    await user.click(screen.getByRole("button", { name: "Save the rule" }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ appliesWhen: null }))
  })
})
