import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { Check } from "@/rules/rule"
import { fenceRules } from "@/tests/fenceRulebook"
import { AttributeChip, CheckSummary, ConditionsSummary } from "./RuleSchema"

describe("AttributeChip", () => {
  it("names an attribute and explains it when selected", async () => {
    const user = userEvent.setup()
    render(<AttributeChip attributeKey="segment.height" />)
    await user.click(screen.getByRole("button", { name: "Fence run: Height without lattice or arbor" }))
    expect(await screen.findByText("A number, in inches")).toBeInTheDocument()
    expect(screen.getByText("segment.height")).toBeInTheDocument()
  })

  it("lists an enum's values, and flags a key the catalog doesn't know", async () => {
    const user = userEvent.setup()
    render(
      <>
        <AttributeChip attributeKey="segment.material" />
        <AttributeChip attributeKey="segment.mystery" />
      </>
    )
    await user.click(screen.getByRole("button", { name: "Fence run: Material" }))
    expect(await screen.findByText("wood, composite, metal, vinyl, other")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "segment.mystery" }))
    expect(await screen.findByText(/isn’t in the catalog/)).toBeInTheDocument()
  })
})

describe("CheckSummary and ConditionsSummary", () => {
  const summary = (check: Check) => render(<CheckSummary check={check} />).container.textContent

  it("summarizes every check type with readable names", () => {
    for (const rule of fenceRules) {
      expect(summary(rule.check)).not.toContain("segment.")
    }
    expect(summary({ type: "range", attributes: ["segment.height"], min: 40, max: 72 })).toContain(
      "must be between 40 and 72 inches"
    )
    expect(
      summary({ type: "range", attributes: ["segment.height", "segment.latticeHeight"], min: null, max: 90 })
    ).toContain("plus")
    expect(summary({ type: "range", attributes: ["segment.height"], min: 40, max: null })).toContain("at least 40")
    expect(summary({ type: "range", attributes: ["segment.height"], min: null, max: null })).toContain(
      "(no limit given)"
    )
    expect(summary({ type: "required-document", document: "plot-plan", mustState: ["the route"] })).toBe(
      "The application must include the plot plan, stating the route"
    )
    expect(summary({ type: "informational" })).toBe("For information; not checked against applications")
  })

  it("summarizes conditions, and nothing for a rule that always applies", () => {
    const { container, rerender } = render(<ConditionsSummary conditions={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(
      <ConditionsSummary
        conditions={[
          { type: "fact", attribute: "segment.material", operator: "in", value: ["wood", "composite"] },
          { type: "fact", attribute: "segment.style", operator: "exists", value: null },
          { type: "text", id: "c", description: "Visible from the street" }
        ]}
      />
    )
    expect(container.textContent).toBe(
      "Fence run: Material is wood or composite, and Fence run: Style is given, and Visible from the street"
    )
  })
})
