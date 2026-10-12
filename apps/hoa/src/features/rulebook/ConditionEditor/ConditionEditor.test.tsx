import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRecords } from "@/tests/rulebookWorkspace"
import { pickableTerms } from "../TermPicker/TermPicker.utils"
import { ConditionEditor } from "./ConditionEditor"

const records = sampleRecords()
const catalog = { vocabulary: createVocabulary(records.terms), terms: pickableTerms(records.terms) }
const term = { type: "ref" as const, path: ["lease-registration.term"] }
const months = (value: number): T.Operand => ({ type: "quantity", value, unit: "month" })
const premises = { type: "ref" as const, path: ["lease-registration.premises"] }

function setup(value: T.Condition) {
  const onChange = vi.fn<(value: T.Condition) => void>()
  render(
    <ConditionEditor
      label="Applies when"
      value={value}
      onChange={onChange}
      catalog={catalog}
      subject="lease-registration"
    />
  )
  return { onChange, user: userEvent.setup() }
}

describe("ConditionEditor", () => {
  it("edits a comparison: its comparator and the kind of its right side", async () => {
    const { onChange, user } = setup({ type: "compare", left: term, op: ">=", right: months(6) })
    expect(screen.getByRole("combobox", { name: "Applies when: left side: fact" })).toHaveValue("lease term")
    expect(screen.getByRole("spinbutton", { name: "Applies when: right side: amount" })).toHaveValue(6)
    await user.selectOptions(screen.getByRole("combobox", { name: "Applies when: comparison" }), "<=")
    expect(onChange).toHaveBeenLastCalledWith({ type: "compare", left: term, op: "<=", right: months(6) })
    await user.selectOptions(screen.getByRole("combobox", { name: "Applies when: right side: kind" }), "number")
    expect(onChange).toHaveBeenLastCalledWith({
      type: "compare",
      left: term,
      op: ">=",
      right: { type: "number", value: 0 }
    })
  })

  it("edits a list of values from the property's value set", async () => {
    const principal = { type: "value" as const, term: "leased-premises.principal-dwelling" }
    const part = { type: "value" as const, term: "leased-premises.part-of-dwelling" }
    const { onChange, user } = setup({ type: "in", left: premises, values: [principal, part] })
    await user.click(screen.getByRole("button", { name: "Remove separate rooms within the dwelling" }))
    expect(onChange).toHaveBeenLastCalledWith({ type: "in", left: premises, values: [principal] })
  })

  it("edits a range's bounds", async () => {
    const between: T.Condition = {
      type: "between",
      left: term,
      min: months(6),
      max: months(12),
      includeMin: true,
      includeMax: true
    }
    const { onChange, user } = setup(between)
    await user.click(screen.getByRole("checkbox", { name: "Includes the highest" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...between, includeMax: false })
  })

  it("adds, removes and regroups conditions", async () => {
    const compare: T.Condition = { type: "compare", left: term, op: ">=", right: months(6) }
    const { onChange, user } = setup({ type: "all", of: [compare] })
    await user.click(screen.getByRole("button", { name: "Add a condition" }))
    expect(onChange).toHaveBeenLastCalledWith({
      type: "all",
      of: [compare, { type: "compare", left: { type: "ref", path: [] }, op: "=", right: { type: "number", value: 0 } }]
    })
    await user.click(screen.getByRole("button", { name: "Remove Applies when, condition 1" }))
    expect(onChange).toHaveBeenLastCalledWith({ type: "all", of: [] })
    await user.selectOptions(screen.getByRole("combobox", { name: "Applies when: kind" }), "any")
    expect(onChange).toHaveBeenLastCalledWith({ type: "any", of: [compare] })
  })

  it("shows other conditions in words, to be edited as JSON", () => {
    setup({ type: "exists", path: ["lease-registration.term"] })
    expect(screen.getByText(/exists/)).toHaveTextContent("(edit this condition as JSON)")
  })
})
