import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ViolationListItem } from "../violations.functions"
import { ViolationsPage, type ViolationsPageProps } from "./ViolationsPage"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => undefined,
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => <a href={to}>{children}</a>
}))

const violation: ViolationListItem = {
  id: "violation-1",
  title: "Trash cans at the curb",
  unit: "12 Lakeview Drive",
  observedOn: "2026-10-10",
  status: "open",
  rules: ["Trash containers out of sight"],
  nextStep: "Send the notice"
}

function setup(overrides: Partial<ViolationsPageProps> = {}) {
  const props: ViolationsPageProps = {
    violations: [violation],
    canReport: true,
    hasRulebook: true,
    onOpen: vi.fn<(id: string) => void>(),
    ...overrides
  }
  render(<ViolationsPage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("ViolationsPage", () => {
  it("lists violations with what happens next, reports one, and opens one", async () => {
    const { props, user } = setup()
    const report = within(screen.getByRole("group", { name: "Page actions" })).getByRole("link", {
      name: "Report a violation"
    })
    expect(report).toHaveAttribute("href", "/violations/new")
    expect(screen.getByText("Send the notice")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(props.onOpen).toHaveBeenCalledWith("violation-1")
  })

  it("asks the board to publish the rulebook before anything can be reported", () => {
    setup({ violations: [], hasRulebook: false })
    expect(screen.getByText("Publish the rulebook first")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Page actions" })).not.toBeInTheDocument()
  })

  it("shows an owner their own violations, with nothing to report", () => {
    setup({ canReport: false, violations: [{ ...violation, nextStep: "Correct it by Oct 25, 2026" }] })
    expect(screen.getByText("Your violations")).toBeInTheDocument()
    expect(screen.getByText("Correct it by Oct 25, 2026")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Page actions" })).not.toBeInTheDocument()
  })
})
