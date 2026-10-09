import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { Dashboard } from "./Dashboard"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>
}))

const published: DashboardSummary = {
  hoaName: "Sample Ridge HOA",
  publishedVersion: 2,
  publishedAt: "2026-10-07T12:00:00.000Z",
  ruleCount: 3,
  documentTitles: ["CC&Rs", "Design guidelines"]
}
const unpublished: DashboardSummary = { ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }

describe("Dashboard", () => {
  it("shows administrators the rulebook's size and source", () => {
    render(<Dashboard roleId="administrator" summary={published} />)

    expect(screen.getByText("Published rules").closest("[data-slot=card]")).toHaveTextContent("3")
    expect(screen.getByText("Published Oct 7, 2026")).toBeInTheDocument()
    expect(screen.getByText("CC&Rs, Design guidelines")).toBeInTheDocument()
    expect(screen.getByText("Version 2")).toBeInTheDocument()
  })

  it("tells administrators when no rulebook is published", () => {
    render(<Dashboard roleId="administrator" summary={unpublished} />)

    expect(screen.getByText("No rulebook yet")).toBeInTheDocument()
    expect(screen.getAllByText("Not published")).toHaveLength(1)
  })

  it("shows homeowners their community and a way to submit a project", () => {
    render(<Dashboard roleId="homeowner" summary={published} />)

    expect(screen.getByText("Sample Ridge HOA")).toBeInTheDocument()
    expect(screen.getByText("Rules are ready for review")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start an application/ })).toHaveAttribute("href", "/applications")
  })

  it("tells homeowners when the HOA hasn't published its rules", () => {
    render(<Dashboard roleId="homeowner" summary={unpublished} />)
    expect(screen.getByText("Waiting for the HOA to publish its rules")).toBeInTheDocument()
  })
})
