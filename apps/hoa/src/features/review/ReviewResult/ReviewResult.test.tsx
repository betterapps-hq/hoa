import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fenceRules, review } from "@/tests/fixtures"
import { ReviewResult } from "./ReviewResult"

function renderResult(overrides: Partial<typeof review> = {}) {
  render(
    <ReviewResult
      review={{ ...review, ...overrides }}
      rules={fenceRules}
      costUsd={0.0123}
      latencyMs={41250}
      traceId="af66def3b25cf84ff166cbd8f432756e"
    />
  )
}

describe("ReviewResult", () => {
  it("leads with the recommendation, the finding counts and the committee assessment", () => {
    renderResult()

    expect(screen.getByRole("heading", { level: 2, name: "Request more information" })).toBeInTheDocument()
    expect(screen.getByText("1 not met, 1 can't confirm, 1 met")).toBeInTheDocument()
    expect(screen.getByText(review.assessment)).toBeInTheDocument()
    expect(screen.getByText("Not provided")).toBeInTheDocument()
    expect(screen.getByText("1 items before the committee can decide.")).toBeInTheDocument()
    expect(screen.getByText("Provide the fence height.")).toBeInTheDocument()
  })

  it("lists unmet and unconfirmed rules with their citations, and hides met rules until asked", async () => {
    renderResult()

    const notMet = screen.getByRole("rowgroup", { name: "Not met" })
    expect(within(notMet).getByRole("cell", { name: "Composite fence colors" })).toBeInTheDocument()
    expect(within(notMet).getByRole("cell", { name: "Design Guidelines.pdf, 5.4.2, page 17" })).toBeInTheDocument()
    expect(
      within(screen.getByRole("rowgroup", { name: "Can't confirm" })).getByText(/doesn't state the height/)
    ).toBeVisible()
    expect(screen.queryByRole("rowgroup", { name: "Met" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Show 1 rules that are met" }))
    expect(
      within(screen.getByRole("rowgroup", { name: "Met" })).getByText("Design Guidelines.pdf, 5.3.2")
    ).toBeVisible()
  })

  it("copies the homeowner feedback", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    renderResult()
    await user.click(screen.getByRole("button", { name: "Copy feedback" }))

    expect(writeText).toHaveBeenCalledWith(review.feedback)
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  it("shows conditions, and findings for rules missing from the rulebook by ID", () => {
    renderResult({
      recommendation: "approve-with-conditions",
      conditions: ["Use an approved Trex color."],
      missingInformation: [],
      findings: [{ ruleId: "rule-99", status: "not-met", explanation: "Unknown rule.", evidence: "Page 2" }]
    })

    expect(screen.getByRole("heading", { level: 2, name: "Approve with conditions" })).toBeInTheDocument()
    expect(screen.getByText("Use an approved Trex color.")).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "rule-99" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "Not in the rulebook" })).toBeInTheDocument()
    expect(screen.getByText("Nothing is missing.")).toBeInTheDocument()
  })

  it("reports run time, cost and the Langfuse trace", () => {
    renderResult()
    expect(screen.getByText(/Reviewed in 41.3 seconds, cost \$0.0123. Langfuse trace af66def3/)).toBeInTheDocument()
  })
})
