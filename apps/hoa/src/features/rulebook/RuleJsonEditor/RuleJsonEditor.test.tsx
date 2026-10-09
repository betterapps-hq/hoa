import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RuleDraft } from "@/schema/zod"
import { renderInWorkspace, ruleIn, sampleWithTermsApproved } from "@/tests/rulebookWorkspace"
import { draftOf } from "../ruleProblems"
import { RuleJsonEditor } from "./RuleJsonEditor"

const records = sampleWithTermsApproved()
const rule = ruleIn(records, "declaration:3.1(c)/p2#minimum-term")

function setup() {
  const onSave = vi.fn<(draft: RuleDraft) => Promise<void>>(async () => undefined)
  const rendered = renderInWorkspace(<RuleJsonEditor rule={rule} onSave={onSave} onCancel={vi.fn<() => void>()} />, {
    records
  })
  // Pasting a whole rule is one change; typing it key by key would be slow and say nothing more.
  const paste = (value: unknown) =>
    fireEvent.change(screen.getByRole("textbox", { name: "The rule as JSON" }), {
      target: { value: typeof value === "string" ? value : JSON.stringify(value) }
    })
  return { ...rendered, onSave, paste }
}

describe("RuleJsonEditor", () => {
  it("starts from the rule without its review, and saves it", async () => {
    const { user, onSave } = setup()
    expect(screen.getByRole("textbox", { name: "The rule as JSON" })).not.toHaveDisplayValue(/"review"/)
    await user.click(screen.getByRole("button", { name: "Save the rule" }))
    expect(onSave).toHaveBeenCalledWith(draftOf(rule))
  })

  it("says what isn't JSON, what the schema rejects and what the rulebook finds", async () => {
    const { paste } = setup()
    paste("{ not json")
    expect(await screen.findByRole("alert")).toHaveTextContent(/JSON/)
    expect(screen.getByRole("button", { name: "Save the rule" })).toBeDisabled()

    paste({ ...draftOf(rule), modality: "maybe" })
    expect(await screen.findByText(/modality/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save the rule" })).toBeDisabled()

    paste({ ...draftOf(rule), bearer: "gazebo" })
    expect(await screen.findByText("gazebo isn't a term")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save the rule" })).toBeEnabled()

    paste({ ...draftOf(rule), key: "declaration:3.1(c)/p2#another" })
    expect(await screen.findByText(/key can't change/)).toBeInTheDocument()
  })
})
