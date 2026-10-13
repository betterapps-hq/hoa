import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import { HomeownerDashboard } from "./HomeownerDashboard"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => undefined,
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
  it("lists what waits on the homeowner, each linking to its application, and says where the rest stand", () => {
    render(<HomeownerDashboard summary={published} applications={applications} asOf={asOf} />)

    expect(screen.getByRole("heading", { name: "Waiting on you" })).toBeInTheDocument()
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(1)
    const [asked] = items
    expect(asked).toHaveTextContent("Information requested")
    expect(asked).toHaveTextContent("Send the railing color. Asked 2 days ago.")
    expect(within(asked!).getByRole("link")).toHaveAttribute("href", "/applications/deck")
    expect(screen.queryByText("Repaint the trim.")).not.toBeInTheDocument()
    expect(
      screen.getByText("Of your other applications, 1 is with the committee and 1 is decided.")
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "All applications" })).toHaveAttribute("href", "/applications")
  })

  it("says nothing needs the homeowner when nothing does", () => {
    render(<HomeownerDashboard summary={published} applications={applications.slice(0, 2)} asOf={asOf} />)

    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument()
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument()
    expect(screen.getByText("Of your applications, 1 is with the committee and 1 is decided.")).toBeInTheDocument()
  })

  it("offers one way to start an application and a quiet way into the rules", () => {
    render(<HomeownerDashboard summary={published} applications={applications} asOf={asOf} />)

    expect(screen.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications/new")
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
    expect(screen.queryByRole("link", { name: "All applications" })).not.toBeInTheDocument()
    expect(screen.getByText("The HOA hasn't published its rules yet.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Browse the rules" })).not.toBeInTheDocument()
  })
})
