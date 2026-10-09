import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { loadDemoDashboards } from "../demoData"
import { HomeownerDashboard } from "./HomeownerDashboard"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  )
}))

const asOf = new Date("2026-10-09T12:00:00.000Z")
const { homeowner } = loadDemoDashboards(asOf)
const published: DashboardSummary = {
  hoaName: "Sample Ridge HOA",
  publishedVersion: 3,
  publishedAt: "2026-10-07T12:00:00.000Z",
  ruleCount: 42,
  documentTitles: ["Declaration", "Design guidelines"]
}

describe("HomeownerDashboard", () => {
  it("lists what waits on the homeowner before everything else", () => {
    render(<HomeownerDashboard summary={published} data={homeowner} asOf={asOf.toISOString()} />)

    const sections = screen.getAllByRole("region").map((section) => section.getAttribute("aria-label"))
    expect(sections).toEqual(["Waiting on you", "In review", "Decided"])
    const waiting = screen.getByRole("region", { name: "Waiting on you" })
    expect(within(waiting).getAllByRole("listitem")[0]).toHaveTextContent("Information requested")
    expect(within(waiting).getByText(/Asked 2 days ago/)).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "In review" })).toHaveTextContent("On the agenda for Wednesday, Oct 14.")
  })

  it("offers one way to start an application and a quiet way into the rules", () => {
    render(<HomeownerDashboard summary={published} data={homeowner} asOf={asOf.toISOString()} />)

    expect(screen.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications")
    expect(screen.getByRole("link", { name: "Browse the rules" })).toHaveAttribute("href", "/rules")
    expect(screen.getByText("42 rules from 2 governing documents, in force since Oct 7.")).toBeInTheDocument()
    expect(screen.getByText("Submit by Saturday, Oct 10 to be on this agenda.")).toBeInTheDocument()
  })

  it("welcomes a homeowner with no applications and says when there are no rules yet", () => {
    render(
      <HomeownerDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        data={{ applications: [], nextMeeting: null }}
        asOf={asOf.toISOString()}
      />
    )

    expect(screen.getByText("No applications yet")).toBeInTheDocument()
    expect(screen.getByText("The HOA hasn't published its rules yet.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Browse the rules" })).not.toBeInTheDocument()
    expect(screen.queryByText("Next committee meeting")).not.toBeInTheDocument()
  })
})
