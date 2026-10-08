import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Check, Condition } from "@/rules/rule"
import {
  checkTypeLabels,
  CheckEditor,
  conditionValue,
  ConditionsEditor,
  emptyCheck,
  splitList,
  valuesFromList
} from "./CheckEditor"

function renderCheck(check: Check) {
  const onChange = vi.fn<(check: Check) => void>()
  render(<CheckEditor id="rule" value={check} projectType="fence" onChange={onChange} />)
  return { onChange, user: userEvent.setup() }
}

describe("check helpers", () => {
  it("makes an empty check of every type, keeping the chosen detail", () => {
    for (const type of Object.keys(checkTypeLabels)) {
      const check = emptyCheck(type as Check["type"], "segment.color")
      expect(check.type).toBe(type)
    }
    expect(emptyCheck("range", "segment.height")).toEqual({
      type: "range",
      attributes: ["segment.height"],
      min: null,
      max: null
    })
  })

  it("reads comma lists and keeps the aliases of known values", () => {
    expect(splitList(" a, ,b ,c")).toEqual(["a", "b", "c"])
    expect(
      valuesFromList("Saddle, Winchester Grey", [{ value: "Winchester Grey", aliases: ["Winchester Gray"] }])
    ).toEqual([
      { value: "Saddle", aliases: [] },
      { value: "Winchester Grey", aliases: ["Winchester Gray"] }
    ])
  })

  it("types a condition's value by its detail and comparison", () => {
    expect(conditionValue("segment.hasLattice", "equals", "Yes")).toBe(true)
    expect(conditionValue("segment.hasLattice", "equals", "no")).toBe(false)
    expect(conditionValue("segment.material", "equals", " wood ")).toBe("wood")
    expect(conditionValue("segment.material", "in", "wood, composite")).toEqual(["wood", "composite"])
    expect(conditionValue("segment.material", "exists", "x")).toBeNull()
  })
})

describe("CheckEditor", () => {
  it("edits a list of allowed values, its detail and what happens otherwise", async () => {
    const { onChange, user } = renderCheck({
      type: "allowed-values",
      attribute: "segment.manufacturer",
      values: [{ value: "Trex", aliases: [] }],
      otherwise: "not-met"
    })
    expect(screen.getByLabelText("Detail")).toHaveValue("segment.manufacturer")
    const values = screen.getByLabelText("Allowed values")
    await user.clear(values)
    await user.type(values, "Trex, Neoline")
    fireEvent.blur(values)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        values: [
          { value: "Trex", aliases: [] },
          { value: "Neoline", aliases: [] }
        ]
      })
    )
    await user.selectOptions(screen.getByLabelText("When it’s something else"), "committee")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ otherwise: "committee" }))
    await user.selectOptions(screen.getByLabelText("Detail"), "segment.color")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ attribute: "segment.color" }))
  })

  it("switches the check type, keeping the detail", async () => {
    const { onChange, user } = renderCheck({ type: "required-fact", attribute: "segment.height" })
    await user.selectOptions(screen.getByLabelText("What the rule checks"), "range")
    expect(onChange).toHaveBeenCalledWith({ type: "range", attributes: ["segment.height"], min: null, max: null })
  })

  it("edits a table of values that depend on another detail", async () => {
    const { onChange, user } = renderCheck({
      type: "allowed-values-by",
      attribute: "segment.color",
      keyAttribute: "segment.manufacturer",
      table: [{ key: { value: "Trex", aliases: [] }, values: [{ value: "Saddle", aliases: [] }] }],
      unknownKey: "committee"
    })
    const when = screen.getByLabelText("Row 1: when")
    await user.clear(when)
    await user.type(when, "TREX")
    fireEvent.blur(when)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ table: [expect.objectContaining({ key: { value: "TREX", aliases: [] } })] })
    )
    fireEvent.blur(screen.getByLabelText("Row 1: allowed values"), { target: { value: "Saddle, Winchester Grey" } })
    expect(onChange).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Add a row" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ table: [expect.anything(), { key: { value: "", aliases: [] }, values: [] }] })
    )
    await user.click(screen.getByRole("button", { name: "Remove row 1" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ table: [] }))
    await user.selectOptions(screen.getByLabelText("When it isn’t listed"), "not-met")
    await user.selectOptions(screen.getByLabelText("Depends on"), "segment.material")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keyAttribute: "segment.material" }))
  })

  it("edits a range in the detail's unit", () => {
    const range = renderCheck({ type: "range", attributes: ["segment.height"], min: null, max: 72 })
    expect(screen.getByLabelText("At most (inches)")).toHaveValue(72)
    fireEvent.blur(screen.getByLabelText("At least (inches)"), { target: { value: "40" } })
    expect(range.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ min: 40, max: 72 }))
    fireEvent.blur(screen.getByLabelText("At most (inches)"), { target: { value: "" } })
    expect(range.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ max: null }))
  })

  it("edits which detail must match", async () => {
    const matches = renderCheck({ type: "matches", attribute: "gate.color", otherAttribute: "segment.color" })
    await matches.user.selectOptions(screen.getByLabelText("Must match"), "segment.postColor")
    expect(matches.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ otherAttribute: "segment.postColor" }))
  })

  it("edits a required document and what it must state", async () => {
    const { onChange, user } = renderCheck({ type: "required-document", document: "plot-plan", mustState: [] })
    await user.selectOptions(screen.getByLabelText("Document"), "neighbor-approval")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ document: "neighbor-approval" }))
    fireEvent.blur(screen.getByLabelText("It must state"), { target: { value: "the height\n\nthe material" } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mustState: ["the height", "the material"] }))
  })

  it("edits what a model judges", () => {
    const { onChange } = renderCheck({ type: "qualitative", criterion: "" })
    fireEvent.blur(screen.getByLabelText("What to judge"), { target: { value: " Doesn't block the view " } })
    expect(onChange).toHaveBeenLastCalledWith({ type: "qualitative", criterion: "Doesn't block the view" })
  })
})

describe("ConditionsEditor", () => {
  function renderConditions(conditions: Condition[]) {
    const onChange = vi.fn<(conditions: Condition[]) => void>()
    render(<ConditionsEditor id="c" value={conditions} projectType="fence" ruleId="r1" onChange={onChange} />)
    return { onChange, user: userEvent.setup() }
  }

  it("says a rule without conditions always applies, and adds conditions", async () => {
    const { onChange, user } = renderConditions([])
    expect(screen.getByText("Always applies.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add a condition" }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ type: "fact", operator: "equals" })])
    await user.click(screen.getByRole("button", { name: "Add one in words" }))
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: "text", id: expect.stringMatching(/^r1:c/) })
    ])
  })

  it("edits and removes conditions", async () => {
    const { onChange, user } = renderConditions([
      { type: "fact", attribute: "segment.material", operator: "equals", value: "wood" },
      { type: "text", id: "r1:c1", description: "Visible from the street" }
    ])
    await user.selectOptions(screen.getByLabelText("Condition 1: comparison"), "in")
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ operator: "in", value: ["wood"] }),
      expect.anything()
    ])
    fireEvent.blur(screen.getByLabelText("Condition 1: value"), { target: { value: "composite" } })
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ value: "composite" }), expect.anything()])
    await user.selectOptions(screen.getByLabelText("Condition 1"), "segment.location")
    fireEvent.blur(screen.getByLabelText("Condition 2"), { target: { value: "Seen from the street" } })
    expect(onChange).toHaveBeenLastCalledWith([
      expect.anything(),
      { type: "text", id: "r1:c1", description: "Seen from the street" }
    ])
    await user.click(screen.getByRole("button", { name: "Remove condition 2" }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ type: "fact" })])
    await user.click(screen.getByRole("button", { name: "Remove condition 1" }))
  })
})
