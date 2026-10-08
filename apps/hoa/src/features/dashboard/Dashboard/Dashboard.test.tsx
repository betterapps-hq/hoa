import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ModelCheckResult } from "@/features/modelCheck/modelCheckResult"
import { rulebook } from "@/tests/fixtures"
import { Dashboard } from "./Dashboard"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>
}))

const onModelCheck = vi.fn<() => Promise<ModelCheckResult>>()

describe("Dashboard", () => {
  it("shows administrators the rulebook's size and source, and the model check", () => {
    render(<Dashboard roleId="administrator" rulebook={rulebook} onModelCheck={onModelCheck} />)

    expect(screen.getByText("Published rules").closest("[data-slot=card]")).toHaveTextContent("3")
    expect(screen.getByText("Published Oct 7, 2026")).toBeInTheDocument()
    expect(screen.getByText("CC&Rs.pdf, Design Guidelines.pdf")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Model check" })).toBeInTheDocument()
  })

  it("tells administrators when no rulebook is published", () => {
    render(<Dashboard roleId="administrator" rulebook={null} onModelCheck={onModelCheck} />)

    expect(screen.getByText("No rulebook yet")).toBeInTheDocument()
    expect(screen.getAllByText("Not published")).toHaveLength(1)
  })

  it("shows homeowners their community and a way to submit a project", () => {
    render(<Dashboard roleId="homeowner" rulebook={rulebook} onModelCheck={onModelCheck} />)

    expect(screen.getByText("Sample Ridge HOA")).toBeInTheDocument()
    expect(screen.getByText("Rules are ready for review")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Submit a project/ })).toHaveAttribute("href", "/submit")
    expect(screen.queryByRole("heading", { name: "Model check" })).not.toBeInTheDocument()
  })

  it("tells homeowners when the HOA hasn't published its rules", () => {
    render(<Dashboard roleId="homeowner" rulebook={null} onModelCheck={onModelCheck} />)
    expect(screen.getByText("Waiting for the HOA to publish its rules")).toBeInTheDocument()
  })
})
