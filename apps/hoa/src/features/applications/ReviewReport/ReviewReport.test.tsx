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
}

function setup({ audience = "homeowner", change = (review) => review, decision = null }: Options = {}) {
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
      <ReviewReport
        context={context}
        decision={decision}
        tabs={[{ value: "files", label: "Files", count: 2, content: <p>The packet</p> }]}
      />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), review }
}

const group = (name: string) => within(screen.getByRole("region", { name }))
const overview = () => within(screen.getByRole("tabpanel", { name: "Overview" }))

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
  it("leads with the recommendation in plain words, why, when it ran, and what it rests on", () => {
    setup()
    const verdict = screen.getByRole("region", { name: "More information needed" })
    expect(within(verdict).getByText("Review result")).toBeInTheDocument()
    const summary = within(verdict).getByText(/^Choose a listed color under/)
    expect(within(summary).getByRole("link", { name: colors })).toBeInTheDocument()
    expect(within(verdict).getByText(/^Provisional review from/)).toBeInTheDocument()
    expect(within(verdict).getByRole("button", { name: "What this means" })).toBeInTheDocument()
    const counts = within(within(verdict).getByRole("list", { name: "The review in numbers" }))
    expect(counts.getByRole("button", { name: "To add 11" })).toBeInTheDocument()
    expect(counts.getByRole("button", { name: "To change 3" })).toBeInTheDocument()
    expect(counts.getByRole("button", { name: /^Rules met \d+ of \d+$/ })).toBeInTheDocument()
  })

  it("words the recommendation for the committee", () => {
    setup({ audience: "committee" })
    expect(screen.getByText("The review recommends")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Request more information" })).toBeInTheDocument()
    expect(screen.getByText(/^Request information\. The colors fail/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Missing 11" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "For your judgment" })).toBeInTheDocument()
  })

  it("says why from the counts when the review has no written summary", () => {
    setup({ change: (review) => ({ ...review, feedback: "" }) })
    expect(screen.getByText("Your packet doesn't yet show 11 things the rules ask for.")).toBeInTheDocument()
  })

  it("lists the next steps first, in the order that changes the outcome, the first few of a long group", async () => {
    const { user } = setup()
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    const headings = overview()
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual(["Add to your packet", "Change in your plans", "Left to the committee"])
    const provide = group("Add to your packet")
    expect(provide.getAllByRole("listitem")).toHaveLength(5)
    await user.click(provide.getByRole("button", { name: "Show 6 more" }))
    expect(provide.getAllByRole("listitem")).toHaveLength(11)
    expect(provide.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true")
    expect(group("Change in your plans").getAllByRole("listitem")).toHaveLength(3)
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

  it("names each rule a line marks, linked to its citation, and opens the line from the rest of it", async () => {
    const fence = fenceReview()
    const [first] = fence.review.changes
    const title = fence.rules.find((rule) => rule.key === first?.ruleKey)?.title ?? ""
    const { user } = setup({
      change: (review) => ({
        ...review,
        changes: review.changes.map((item, index) =>
          index === 0 ? { ...item, text: `Choose a listed color under {{rule:${item.ruleKey}}}.` } : item
        )
      })
    })
    const changes = group("Change in your plans")
    expect(changes.getByRole("link", { name: title })).toBeInTheDocument()
    const line = changes.getByRole("button", { name: `Choose a listed color under ${title}.` })
    await user.click(line)
    expect(line).toHaveAttribute("aria-expanded", "true")
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
    setup({ change: (review) => ({ ...clean(review), feedback: "" }) })
    expect(screen.getByRole("heading", { name: "Ready for approval" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "To add 0" })).not.toBeInTheDocument()
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
    expect(overview().getAllByRole("listitem")).toHaveLength(15)
    expect(screen.getByRole("button", { name: "Show 35 more" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show 25 more" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show 5 more" })).toBeInTheDocument()
  })

  it("puts changes first when the review recommends denial", () => {
    setup({ change: (review) => ({ ...review, recommendation: "deny" }) })
    expect(screen.getByRole("heading", { name: "Likely to be denied as planned" })).toBeInTheDocument()
    expect(overview().getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Change in your plans")
  })

  it("shows the committee's decision at the top once made, with what the review found", () => {
    setup({
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
    expect(screen.getByText(/^Choose a listed color under/)).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Add to your packet" })).toBeInTheDocument()
  })

  it("keeps how each rule was checked, what it read and the page's own tabs a tab away", async () => {
    const { user } = setup()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /^Rules \d+$/ }))
    expect(screen.getByRole("table")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /^Facts \d+$/ }))
    const run = within(screen.getByRole("region", { name: "Left side run" }))
    expect(run.getAllByText(/River Birtch/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole("tab", { name: "Files 2" }))
    expect(screen.getByText("The packet")).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Summary" })).not.toBeInTheDocument()
  })

  it("links from a rule's result back to its next step, showing it if it was hidden", async () => {
    const { user } = setup()
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined)
    await user.click(screen.getByRole("tab", { name: /^Rules \d+$/ }))
    await user.click(
      screen.getByRole("button", { name: "Gates match a composite fence's color, Gate on the return run: Missing" })
    )
    const sheet = await screen.findByRole("dialog")
    await user.click(within(sheet).getByRole("button", { name: /^Add to your packet: / }))
    const item = await screen.findByRole("button", { name: /^Gates match a composite fence's color \(Gate/ })
    await vi.waitFor(() => expect(item).toHaveFocus())
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
  })
})
