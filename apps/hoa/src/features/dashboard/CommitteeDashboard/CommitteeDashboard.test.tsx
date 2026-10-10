import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import { CommitteeDashboard } from "./CommitteeDashboard"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    className?: string
  }) => (
    <a href={to.replace("$applicationId", params?.applicationId ?? "")} className={className}>
      {children}
    </a>
  )
}))

const asOf = "2026-10-09T12:00:00.000Z"
const published: DashboardSummary = {
  hoaName: "Sample Ridge HOA",
  publishedVersion: 3,
  publishedAt: "2026-10-07T12:00:00.000Z",
  ruleCount: 42,
  documentTitles: ["Declaration", "Design guidelines"]
}

const applications = [
  application({
    id: "fence",
    projectTypeLabel: "Fence",
    description: "A rear fence.",
    status: "submitted",
    createdAt: "2026-10-05T10:00:00.000Z",
    reviews: [{ recommendation: "approve", createdAt: "2026-10-05T11:00:00.000Z" }],
    submittedAt: "2026-10-06T15:00:00.000Z"
  }),
  application({
    id: "porch",
    projectTypeLabel: "Porch",
    description: "A screened porch.",
    status: "submitted",
    createdAt: "2026-09-18T10:00:00.000Z",
    reviews: [{ recommendation: "refer-to-committee", createdAt: "2026-09-19T11:00:00.000Z" }],
    submittedAt: "2026-09-20T15:00:00.000Z"
  }),
  application({
    id: "paint",
    projectTypeLabel: null,
    description: "Repaint the body.",
    status: "information-requested",
    submittedAt: "2026-09-25T15:00:00.000Z",
    decision: decision("information-requested", "2026-10-01T15:00:00.000Z", "Send the paint chips.")
  }),
  application({ id: "draft", status: "draft", createdAt: "2026-10-09T10:00:00.000Z" })
]

const card = (label: string) => screen.getByText(label).closest("[data-slot=card]")

describe("CommitteeDashboard", () => {
  it("leads with what's waiting and how long the oldest has waited", () => {
    render(<CommitteeDashboard summary={published} nextRulebook={null} applications={applications} asOf={asOf} />)

    expect(card("Waiting for a decision")).toHaveTextContent("2")
    expect(card("Waiting for a decision")).toHaveTextContent("The oldest came in 19 days ago.")
    expect(card("Waiting on homeowners")).toHaveTextContent("1")
    expect(card("Waiting on homeowners")).toHaveTextContent("The oldest request went out 8 days ago.")
    expect(card("Rulebook in force")).toHaveTextContent("Version 3")
    expect(card("Rulebook in force")).toHaveTextContent("42 rules, published Oct 7.")
  })

  it("lists the queue longest-waiting first and switches to requests on homeowners", async () => {
    const user = userEvent.setup()
    render(<CommitteeDashboard summary={published} nextRulebook={null} applications={applications} asOf={asOf} />)

    const [oldest, newest] = within(screen.getByRole("tabpanel")).getAllByRole("listitem")
    expect(oldest).toHaveTextContent("Porch")
    expect(oldest).toHaveTextContent("Waiting 19 days")
    expect(oldest).toHaveTextContent("A screened porch.")
    expect(oldest).toHaveTextContent("Review: refer to the committee.")
    expect(within(oldest!).getByRole("link")).toHaveAttribute("href", "/applications/porch")
    expect(newest).toHaveTextContent("Fence")

    await user.click(screen.getByRole("tab", { name: "With homeowners" }))
    const [asked] = within(screen.getByRole("tabpanel")).getAllByRole("listitem")
    expect(asked).toHaveTextContent("Something else")
    expect(asked).toHaveTextContent("Send the paint chips.")
  })

  it("shows recent activity from the applications' records", () => {
    render(<CommitteeDashboard summary={published} nextRulebook={null} applications={applications} asOf={asOf} />)

    const activity = within(card("Recent activity") as HTMLElement).getAllByRole("listitem")
    expect(activity[0]).toHaveTextContent("Started")
    expect(activity[0]).toHaveTextContent("2 hours ago")
    expect(within(activity[0]!).getByRole("link")).toHaveAttribute("href", "/applications/draft")
    expect(activity[1]).toHaveTextContent("FenceA rear fence.Submitted to the committee")
    expect(screen.queryByText(/meeting/i)).not.toBeInTheDocument()
  })

  it("points to a draft rulebook that needs review", () => {
    render(
      <CommitteeDashboard
        summary={published}
        nextRulebook={{ status: "draft", createdAt: "2026-10-08T00:00:00.000Z", rulesToReview: 12, openQuestions: 2 }}
        applications={applications}
        asOf={asOf}
      />
    )

    expect(screen.getByText("A draft has 12 rules and 2 questions to review.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Review the draft" })).toHaveAttribute("href", "/rules")
  })

  it("says a new draft is being built", () => {
    render(
      <CommitteeDashboard
        summary={published}
        nextRulebook={{ status: "building" }}
        applications={applications}
        asOf={asOf}
      />
    )
    expect(screen.getByText("A new draft is being built.")).toBeInTheDocument()
  })

  it("says so when nothing is waiting and no rulebook is published", () => {
    render(
      <CommitteeDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        nextRulebook={null}
        applications={[]}
        asOf={asOf}
      />
    )

    expect(card("Waiting for a decision")).toHaveTextContent("Nothing is waiting.")
    expect(card("Rulebook in force")).toHaveTextContent("None")
    expect(screen.getByText("Nothing waiting for a decision.")).toBeInTheDocument()
    expect(screen.getByText("Nothing has happened yet.")).toBeInTheDocument()
  })
})
