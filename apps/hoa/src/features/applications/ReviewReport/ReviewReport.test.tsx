import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Application } from "@/applications/application"
import type { ActionItem, Review } from "@/review/reviewModel"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { ReviewReport } from "./ReviewReport"

const colors = "Composite colors by manufacturer"

type Options = {
  audience?: ReviewAudience
  change?: (review: Review) => Review
  decision?: Application["decision"]
  isActing?: boolean
}

function setup({
  audience = "homeowner",
  change = (review) => review,
  decision = null,
  isActing = true
}: Options = {}) {
  const fence = fenceReview()
  const review = change(fence.review)
  const context = createReviewContext({
    review,
    rules: fence.rules,
    terms: fence.terms,
    files: fence.files,
    audience,
    entityEvidence: []
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewReport context={context} decision={decision} isActing={isActing} action={<button>Act now</button>} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), review }
}

const group = (name: string) => within(screen.getByRole("region", { name }))

/** A review that found nothing to change, provide or decide. */
const clean = (review: Review): Review => ({
  ...review,
  recommendation: "approve",
  provisional: false,
  changes: [],
  missingInformation: [],
  committeeDecisions: [],
  suggestions: [],
  findings: review.findings.map((finding) => ({ ...finding, outcome: "met" }))
})

const items = (count: number, prefix: string): ActionItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    ruleKey: "guidelines:5.2.2#k-style",
    entities: ["run-1"],
    text: `${prefix} item ${index + 1}`
  }))

describe("ReviewReport", () => {
  it("leads with the recommendation in plain words, why, and when it ran", () => {
    setup()
    const verdict = screen.getByRole("region", { name: "More information needed" })
    expect(within(verdict).getByText("Review result")).toBeInTheDocument()
    expect(within(verdict).getByText("Your packet doesn't yet show 11 things the rules ask for.")).toBeInTheDocument()
    expect(within(verdict).getByText(/^Provisional review from/)).toBeInTheDocument()
    expect(within(verdict).getByRole("button", { name: "What this means" })).toBeInTheDocument()
  })

  it("words the recommendation for the committee", () => {
    setup({ audience: "committee" })
    expect(screen.getByText("The review recommends")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Request more information" })).toBeInTheDocument()
    expect(screen.getByText("The packet doesn't show 11 things the rules ask for.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you decide" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "For your judgment" })).toBeInTheDocument()
  })

  it("lists the next steps in the order that changes the outcome, the first few of a long group", async () => {
    const { user } = setup()
    expect(screen.getByRole("heading", { name: "What to do next" })).toBeInTheDocument()
    const steps = within(screen.getByRole("region", { name: "What to do next" }))
    const headings = steps.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(["Add to your packet", "Change in your plans", "Left to the committee"])
    const provide = group("Add to your packet")
    expect(provide.getAllByRole("listitem")).toHaveLength(5)
    await user.click(provide.getByRole("button", { name: "Show 6 more" }))
    expect(provide.getAllByRole("listitem")).toHaveLength(11)
    expect(provide.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true")
    expect(group("Change in your plans").getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Act now" })).toBeInTheDocument()
  })

  it("keeps an item to one line, with its rule and evidence on demand", async () => {
    const { user } = setup()
    const changes = group("Change in your plans")
    const item = changes.getByRole("button", { name: /^Composite colors by manufacturer \(Left side run/ })
    expect(changes.queryByRole("link", { name: "Guidelines 5.4.2(i)" })).not.toBeInTheDocument()
    await user.click(item)
    expect(item).toHaveAttribute("aria-expanded", "true")
    expect(changes.getByRole("link", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
    await user.click(changes.getByRole("button", { name: "What the review read for Right side run" }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByRole("heading", { name: colors })).toBeInTheDocument()
    expect(within(sheet).getByText("Right side run")).toBeInTheDocument()
  })

  it("hides suggestions until asked, since they don't affect the recommendation", async () => {
    const { user } = setup({
      change: (review) => ({ ...review, suggestions: items(2, "Suggestion") })
    })
    const suggestions = group("Suggestions")
    expect(suggestions.queryByRole("listitem")).not.toBeInTheDocument()
    await user.click(suggestions.getByRole("button", { name: "Show 2 suggestions" }))
    expect(suggestions.getAllByRole("listitem")).toHaveLength(2)
  })

  it("says plainly when there's nothing to do", () => {
    setup({ change: clean })
    expect(screen.getByRole("heading", { name: "Ready for approval" })).toBeInTheDocument()
    expect(screen.getByText("Your packet meets every rule the review checked.")).toBeInTheDocument()
    expect(screen.getByText("Nothing to change or add.")).toBeInTheDocument()
    expect(screen.getByText(/^Reviewed /)).toBeInTheDocument()
    expect(screen.queryByText("What this means")).not.toBeInTheDocument()
  })

  it("reads well with many items: the first few of each group", () => {
    setup({
      change: (review) => ({
        ...review,
        missingInformation: items(40, "Provide"),
        changes: items(30, "Change"),
        committeeDecisions: items(10, "Committee")
      })
    })
    expect(screen.getAllByRole("listitem")).toHaveLength(15)
    expect(screen.getByRole("button", { name: "Show 35 more" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show 25 more" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show 5 more" })).toBeInTheDocument()
  })

  it("puts changes first when the review recommends denial", () => {
    setup({ change: (review) => ({ ...review, recommendation: "deny" }) })
    expect(screen.getByRole("heading", { name: "Likely to be denied as planned" })).toBeInTheDocument()
    const steps = within(screen.getByRole("region", { name: "What to do next" }))
    expect(steps.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Change in your plans")
  })

  it("shows the committee's decision at the top once made, with the review's findings behind disclosure", async () => {
    const { user } = setup({
      isActing: false,
      decision: {
        outcome: "approved-with-conditions",
        note: "Use a listed color.",
        decidedBy: "a",
        decidedAt: "2026-10-09T12:00:00.000Z"
      }
    })
    expect(screen.getByText("Committee decision")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Approved with conditions" })).toBeInTheDocument()
    expect(screen.getByText("Use a listed color.")).toBeInTheDocument()
    expect(screen.getByText(/The review recommended: request more information\./)).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Add to your packet" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "What the review found" }))
    expect(screen.getByRole("region", { name: "Add to your packet" })).toBeInTheDocument()
  })

  it("keeps the rule matrix, what it read and the written summary behind disclosure", async () => {
    const { user } = setup()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^How each rule was checked/ }))
    expect(screen.getByRole("table")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^What the review read from your packet/ }))
    await user.click(screen.getByRole("button", { name: /^Left side run(?!:)/ }))
    expect(screen.getByText("Written as “River Birtch”")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "The review's written summary" }))
    const feedback = screen.getByText(/Choose a listed color under/)
    expect(within(feedback).getByRole("link", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
  })

  it("links from a finding in the matrix back to its next step, showing it if it was hidden", async () => {
    const { user } = setup()
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined)
    await user.click(screen.getByRole("button", { name: /^How each rule was checked/ }))
    await user.click(
      screen.getByRole("button", { name: "Gates match a composite fence's color, Gate on the return run: Missing" })
    )
    const sheet = await screen.findByRole("dialog")
    await user.click(within(sheet).getByRole("button", { name: /^Add to your packet: / }))
    const item = await screen.findByRole("button", { name: /^Gates match a composite fence's color \(Gate/ })
    await vi.waitFor(() => expect(item).toHaveFocus())
  })
})
