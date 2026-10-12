import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import { HomeownerDashboard } from "./HomeownerDashboard"

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
    id: "shed",
    projectTypeLabel: "Shed",
    description: "A shed behind the garage.",
    status: "decided",
    decision: decision("approved", "2026-10-02T20:00:00.000Z")
  }),
  application({
    id: "paint",
    projectTypeLabel: null,
    description: "Repaint the trim.",
    status: "submitted",
    submittedAt: "2026-10-05T15:00:00.000Z"
  }),
  application({
    id: "deck",
    status: "information-requested",
    decision: decision("information-requested", "2026-10-07T15:00:00.000Z", "Send the railing color.")
  })
]

describe("HomeownerDashboard", () => {
  it("lists what waits on the homeowner first, each linking to its application", () => {
    render(<HomeownerDashboard summary={published} applications={applications} asOf={asOf} />)

    const sections = screen.getAllByRole("region").map((section) => section.getAttribute("aria-label"))
    expect(sections).toEqual(["Waiting on you", "In review", "Decided"])
    const [asked] = within(screen.getByRole("region", { name: "Waiting on you" })).getAllByRole("listitem")
    expect(asked).toHaveTextContent("Information requested")
    expect(asked).toHaveTextContent("Send the railing color. Asked 2 days ago.")
    expect(within(asked).getByRole("link")).toHaveAttribute("href", "/applications/deck")
    expect(screen.getByRole("region", { name: "In review" })).toHaveTextContent(
      "Something elseWith the committeeRepaint the trim.With the committee for a decision. Submitted Oct 5."
    )
    expect(screen.getByRole("region", { name: "Decided" })).toHaveTextContent("Decided Oct 2.")
  })

  it("offers one way to start an application and a quiet way into the rules", () => {
    render(<HomeownerDashboard summary={published} applications={applications} asOf={asOf} />)

    expect(screen.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications")
    expect(screen.getByRole("link", { name: "Browse the rules" })).toHaveAttribute("href", "/rules")
    expect(screen.getByText("42 rules from 2 governing documents, in force since Oct 7.")).toBeInTheDocument()
    expect(screen.queryByText(/meeting/i)).not.toBeInTheDocument()
  })

  it("says so quietly when the homeowner has no applications and no rules are published", () => {
    render(
      <HomeownerDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        applications={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByText("You haven't started an application yet.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Start an application" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Open your applications" })).not.toBeInTheDocument()
    expect(screen.getByText("The HOA hasn't published its rules yet.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Browse the rules" })).not.toBeInTheDocument()
  })
})
