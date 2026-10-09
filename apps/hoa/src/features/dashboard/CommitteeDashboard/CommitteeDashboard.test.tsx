import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { loadDemoDashboards } from "../demoData"
import { CommitteeDashboard } from "./CommitteeDashboard"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  )
}))

const asOf = new Date("2026-10-09T12:00:00.000Z")
const { committee } = loadDemoDashboards(asOf)
const published: DashboardSummary = {
  hoaName: "Sample Ridge HOA",
  publishedVersion: 3,
  publishedAt: "2026-10-07T12:00:00.000Z",
  ruleCount: 42,
  documentTitles: ["Declaration", "Design guidelines"]
}

const card = (label: string) => screen.getByText(label).closest("[data-slot=card]")

describe("CommitteeDashboard", () => {
  it("leads with what's waiting and how long the oldest has waited", () => {
    render(<CommitteeDashboard summary={published} nextRulebook={null} data={committee} asOf={asOf.toISOString()} />)

    expect(card("Waiting for a decision")).toHaveTextContent("5")
    expect(card("Waiting for a decision")).toHaveTextContent("The oldest came in 19 days ago.")
    expect(card("Waiting on homeowners")).toHaveTextContent("2")
    expect(card("Rulebook in force")).toHaveTextContent("Version 3")
    expect(card("Rulebook in force")).toHaveTextContent("42 rules, published Oct 7.")
  })

  it("lists the queue longest-waiting first and switches to requests on homeowners", async () => {
    const user = userEvent.setup()
    render(<CommitteeDashboard summary={published} nextRulebook={null} data={committee} asOf={asOf.toISOString()} />)

    const toDecide = screen.getByRole("tabpanel")
    const [oldest] = within(toDecide).getAllByRole("listitem")
    expect(oldest).toHaveTextContent("Elena Ortiz")
    expect(oldest).toHaveTextContent("Waiting 19 days")
    expect(oldest).toHaveTextContent("Review: refer to the committee. On the Oct 14 agenda.")

    await user.click(screen.getByRole("tab", { name: "With homeowners" }))
    const [longest] = within(screen.getByRole("tabpanel")).getAllByRole("listitem")
    expect(longest).toHaveTextContent("Dana Whitfield")
    expect(longest).toHaveTextContent("Send the manufacturer's color names and paint chips.")
  })

  it("points to a draft rulebook that needs review", () => {
    render(
      <CommitteeDashboard
        summary={published}
        nextRulebook={{ status: "draft", createdAt: "2026-10-08T00:00:00.000Z", rulesToReview: 12, openQuestions: 2 }}
        data={committee}
        asOf={asOf.toISOString()}
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
        data={committee}
        asOf={asOf.toISOString()}
      />
    )
    expect(screen.getByText("A new draft is being built.")).toBeInTheDocument()
  })

  it("shows meetings with their agendas and recent activity", () => {
    render(<CommitteeDashboard summary={published} nextRulebook={null} data={committee} asOf={asOf.toISOString()} />)

    const next = screen.getByRole("region", { name: "Architectural committee, Wednesday, Oct 14" })
    expect(within(within(next).getByRole("list", { name: "Agenda" })).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByRole("region", { name: "Architectural committee, Wednesday, Nov 11" })).toHaveTextContent(
      "Submissions close Wednesday, Nov 4."
    )
    expect(screen.getByText("2 hours ago")).toBeInTheDocument()
  })

  it("says so when nothing is waiting and no rulebook is published", () => {
    render(
      <CommitteeDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        nextRulebook={null}
        data={{ applications: [], meetings: [], activity: [] }}
        asOf={asOf.toISOString()}
      />
    )

    expect(card("Waiting for a decision")).toHaveTextContent("Nothing is waiting.")
    expect(card("Rulebook in force")).toHaveTextContent("None")
    expect(screen.getByText("No applications are waiting for a decision.")).toBeInTheDocument()
    expect(screen.getByText("No meetings are scheduled.")).toBeInTheDocument()
    expect(screen.getByText("Nothing has happened yet.")).toBeInTheDocument()
  })
})
