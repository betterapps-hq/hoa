import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { Review } from "@/review/reviewModel"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { ReviewReport } from "./ReviewReport"

function setup(audience: ReviewAudience = "homeowner", change: Partial<Review> = {}) {
  const { review, rules, terms, files } = fenceReview()
  const context = createReviewContext({
    review: { ...review, ...change },
    rules,
    terms,
    files,
    audience,
    entityEvidence: []
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewReport context={context} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), review }
}

/** The card with this title. */
function card(title: string) {
  const found = screen.getByText(title, { selector: "[data-slot=card-title]" }).closest("[data-slot=card]")
  if (!(found instanceof HTMLElement)) {
    throw new Error(`No card titled ${title}`)
  }
  return within(found)
}

describe("ReviewReport", () => {
  it("gives the recommendation, and says a review before submission is provisional", () => {
    setup()
    expect(screen.getByText("More information needed")).toBeInTheDocument()
    expect(screen.getByText("Provisional review")).toBeInTheDocument()
  })

  it("names every recommendation, including referral to the committee and denial", () => {
    setup("homeowner", { recommendation: "refer-to-committee", provisional: false })
    expect(screen.getByText("Refer to the committee")).toBeInTheDocument()
    expect(screen.queryByText("Provisional review")).not.toBeInTheDocument()
  })

  it("renders the writer's rule markers as references to the rule and its citation", () => {
    setup()
    const feedback = screen.getByText(/Choose a listed color under/)
    expect(within(feedback).getByText("Composite colors by manufacturer")).toBeInTheDocument()
    expect(within(feedback).getByRole("button", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
  })

  it("shows the committee the assessment instead of the feedback", () => {
    setup("committee")
    expect(screen.getByText(/the committee weighs/)).toBeInTheDocument()
    expect(screen.queryByText(/Choose a listed color under/)).not.toBeInTheDocument()
  })

  it("lists what to change and provide, naming the entities each covers, with its rule", () => {
    const { review } = setup()
    const changes = screen.getByRole("region", { name: "What to change" })
    expect(within(changes).getAllByRole("listitem")).toHaveLength(review.changes.length)
    expect(
      within(changes).getAllByText(
        "Left side run, Right side run, Rear run, along the permanent open space tract, Short run from the left side line to the garage's front corner"
      )
    ).toHaveLength(2)
    expect(within(changes).getByRole("button", { name: "Guidelines 5.9.1" })).toBeInTheDocument()
    const provide = screen.getByRole("region", { name: "What to provide" })
    expect(within(provide).getAllByText("Gate on the return run", { selector: "p" }).length).toBeGreaterThan(0)
    expect(
      within(screen.getByRole("region", { name: "For the committee" })).getByText(
        "Work in harmony with its surroundings",
        { selector: "span" }
      )
    ).toBeInTheDocument()
  })

  it("lists suggestions when there are some", () => {
    setup("homeowner", {
      suggestions: [
        { id: "suggestion-1", ruleKey: "guidelines:5.2.2#k-style", entities: ["run-1"], text: "Consider K style." }
      ]
    })
    expect(
      within(screen.getByRole("region", { name: "Suggestions" })).getByText("Consider K style.")
    ).toBeInTheDocument()
  })

  it("groups findings by outcome with the rule, its statement, the entities, the reason and the provision", async () => {
    const { user } = setup()
    const findings = card("Findings")
    await user.click(findings.getByRole("button", { name: "Not met (9)" }))
    const item = findings
      .getAllByRole("listitem")
      .find((found) => within(found).queryByText("Composite colors by manufacturer", { selector: "span" }))
    expect(item).toBeDefined()
    const finding = within(item ?? document.body)
    expect(finding.getByRole("button", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
    expect(finding.getAllByRole("button", { name: "fence run" }).length).toBeGreaterThan(0)
    expect(finding.getByText(/Left side run, Right side run/)).toBeInTheDocument()
    expect(finding.getByRole("button", { name: /^View in document/ })).toBeInTheDocument()
  })

  it("shows what was read from the packet, per entity, with the evidence and confidence", async () => {
    const { user } = setup()
    await user.click(card("What we read from your packet").getByRole("button", { name: /^Left side run/ }))
    expect(screen.getByText("“Trex fence in River Birtch”")).toBeInTheDocument()
    expect(screen.getByText("Written as “River Birtch”")).toBeInTheDocument()
    expect(screen.getByText("confidence 90%")).toBeInTheDocument()
  })
})
