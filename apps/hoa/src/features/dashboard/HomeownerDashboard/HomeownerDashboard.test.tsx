import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
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
    <a href={to.replace(/\$(\w+)/g, (_, name: string) => params?.[name] ?? "")} className={className}>
      {children}
    </a>
  )
}))

const asOf = "2026-10-09T12:00:00.000Z"
const published: DashboardSummary = {
  organizationName: "Sample Ridge HOA",
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

const activity: ActivityEvent[] = [
  {
    id: "deck-asked",
    at: "2026-10-07T15:00:00.000Z",
    by: "Sam Rivera",
    type: "application-decided",
    application: { id: "deck", projectTypeLabel: "Deck", description: "A deck behind the house." },
    outcome: "information-requested"
  },
  { id: "published", at: "2026-10-07T12:00:00.000Z", by: "Sam Rivera", type: "rulebook-published", version: 3 },
  {
    id: "paint-submitted",
    at: "2026-10-05T15:00:00.000Z",
    by: "Jordan Avery",
    type: "application-submitted",
    application: { id: "paint", projectTypeLabel: null, description: "Repaint the trim." },
    again: false
  }
]

const card = (heading: string) => screen.getByRole("heading", { name: heading }).closest("[data-slot=card]")
const rows = (heading: string) => within(card(heading) as HTMLElement).getAllByRole("listitem")

describe("HomeownerDashboard", () => {
  it("lists what waits on the homeowner, their applications first, then the samples of what an HOA asks", () => {
    render(<HomeownerDashboard summary={published} applications={applications} activity={activity} asOf={asOf} />)

    const [asked, dues, notice] = rows("Needs your attention")
    expect(asked).toHaveTextContent("Information requested")
    expect(asked).toHaveTextContent("Send the railing color. Asked 2 days ago.")
    expect(asked).toHaveTextContent("Architectural review")
    expect(within(asked!).getByRole("link")).toHaveAttribute("href", "/applications/deck")
    expect(within(asked!).queryByText("Sample")).not.toBeInTheDocument()
    expect(dues).toHaveTextContent("Quarterly assessmentSampleDue Nov 1")
    expect(within(dues!).queryByRole("link")).not.toBeInTheDocument()
    expect(notice).toHaveTextContent("Courtesy notice")
    expect(notice).toHaveTextContent("Violations")
    expect(screen.queryByText("Repaint the trim.", { selector: "[data-slot=item-description]" })).toBeNull()
  })

  it("says where each area stands for the homeowner, the real ones opening their pages", () => {
    render(<HomeownerDashboard summary={published} applications={applications} activity={activity} asOf={asOf} />)

    const [review, rulebook, ...samples] = rows("Sample Ridge HOA")
    expect(review).toHaveTextContent(
      "Of your 3 applications, 1 waits on you, 1 is with the committee and 1 is decided."
    )
    expect(within(review!).getByRole("link")).toHaveAttribute("href", "/applications")
    expect(rulebook).toHaveTextContent("42 rules from 2 governing documents, in force since Oct 7.")
    expect(within(rulebook!).getByRole("link")).toHaveAttribute("href", "/rules")
    expect(samples.map((row) => within(row).getByText("Sample"))).toHaveLength(4)
    expect(samples[0]).toHaveTextContent("Paid through Oct 31. The next assessment, $350, is due Nov 1.")
  })

  it("lists what happened to the homeowner's applications and the rules, naming who did each", () => {
    render(<HomeownerDashboard summary={published} applications={applications} activity={activity} asOf={asOf} />)

    const lines = rows("Recent activity")
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining("Information requested by Sam RiveraArchitectural review"),
      expect.stringContaining("Published by Sam RiveraRulebook"),
      expect.stringMatching(/^Landscaping in the common areas.*Posted by Morgan Lee for the boardAnnouncementsSample/),
      expect.stringContaining("Submitted to the committee by Jordan AveryArchitectural review"),
      expect.stringMatching(/^Board meeting minutes.*AnnouncementsSample/)
    ])
    expect(within(lines[0]!).getByRole("link")).toHaveAttribute("href", "/applications/deck")
  })

  it("offers one way to start an application, and says so quietly when there's nothing yet", () => {
    render(
      <HomeownerDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications/new")
    const [review, rulebook] = rows("Sample Ridge HOA")
    expect(review).toHaveTextContent("You haven't started an application yet.")
    expect(rulebook).toHaveTextContent("The HOA hasn't published its rules yet.")
    expect(within(rulebook!).queryByRole("link")).not.toBeInTheDocument()
  })
})
