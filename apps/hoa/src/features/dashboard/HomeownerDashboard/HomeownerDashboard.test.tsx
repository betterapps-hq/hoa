import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import type { DashboardOverview } from "../overview"
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

/** A homeowner with no home on the roll and no violations. */
const quiet: DashboardOverview = {
  today: "2026-10-09",
  isBoard: false,
  money: null,
  dues: null,
  violations: [],
  homes: [],
  upcoming: []
}

/** Casey's home, with a late fine, the month's dues coming, and a violation to correct. */
const casey: DashboardOverview = {
  ...quiet,
  homes: [
    {
      unitId: "unit-31",
      label: "31 Fir Court",
      address: "31 Fir Court, Bellingham, WA 98229",
      balanceCents: 44_500,
      pastDueCents: 2500,
      pastDueSince: "2026-09-14",
      next: { name: "Monthly dues", dueOn: "2026-11-01", amountCents: 42_000, isPosted: true },
      lastPayment: { postedOn: "2026-10-01", amountCents: 5000 }
    }
  ],
  violations: [
    {
      id: "boat",
      title: "A boat in the driveway",
      unit: "31 Fir Court",
      observedOn: "2026-10-02",
      nextStep: { step: "correct", text: "Correct it by Oct 30, 2026", on: "2026-10-30", waitsOn: "owner" },
      hearingOn: null
    }
  ],
  upcoming: [
    {
      id: "cure:boat",
      kind: "violation",
      violationId: "boat",
      on: "2026-10-30",
      subject: "Correct it by then",
      note: "A boat in the driveway"
    },
    {
      id: "dues:unit-31:2026-11-01",
      kind: "dues",
      unitId: "unit-31",
      on: "2026-11-01",
      subject: "Monthly dues due",
      note: "It's on your ledger."
    }
  ]
}

const card = (heading: string) => screen.getByRole("heading", { name: heading }).closest("[data-slot=card]")
const rows = (heading: string) => within(card(heading) as HTMLElement).getAllByRole("listitem")

describe("HomeownerDashboard", () => {
  it("lists what waits on the homeowner: their applications, then nothing from samples", () => {
    render(
      <HomeownerDashboard
        userName="Casey Morgan"
        overview={quiet}
        summary={published}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [asked, ...others] = rows("Needs your attention")
    expect(asked).toHaveTextContent("Information requested")
    expect(asked).toHaveTextContent("Send the railing color. Asked 2 days ago.")
    expect(asked).toHaveTextContent("Architectural review")
    expect(within(asked!).getByRole("link")).toHaveAttribute("href", "/applications/deck")
    expect(within(asked!).queryByText("Sample")).not.toBeInTheDocument()
    expect(others).toEqual([])
    expect(screen.queryByText("Repaint the trim.", { selector: "[data-slot=item-description]" })).toBeNull()
  })

  it("shows the homeowner's home: what they owe, what's late, what's next and what they last paid", () => {
    render(
      <HomeownerDashboard
        userName="Casey Morgan"
        overview={casey}
        summary={published}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByRole("heading", { name: "Welcome back, Casey" })).toBeInTheDocument()
    const home = card("31 Fir Court") as HTMLElement
    expect(within(home).getByText("$445.00")).toBeInTheDocument()
    expect(within(home).getByText("$25.00 past due")).toBeInTheDocument()
    expect(within(home).getByText("$420.00 on Nov 1, 2026")).toBeInTheDocument()
    expect(within(home).getByText("$50.00 on Oct 1, 2026")).toBeInTheDocument()
    expect(within(home).getByRole("link", { name: "Open your ledger" })).toHaveAttribute("href", "/ledger/unit-31")

    const [late, boat] = rows("Needs your attention")
    expect(late).toHaveTextContent("$25.00 past due")
    expect(within(late!).getByRole("link")).toHaveAttribute("href", "/ledger/unit-31")
    expect(boat).toHaveTextContent("A boat in the driveway")
    expect(boat).toHaveTextContent("By Oct 30, 2026")
    expect(within(boat!).getByRole("link")).toHaveAttribute("href", "/violations/boat")

    const [cure, dues] = rows("Coming up").filter((row) => !within(row).queryByText("Sample"))
    expect(cure).toHaveTextContent("Correct it by then")
    expect(within(dues!).getByRole("link")).toHaveAttribute("href", "/ledger/unit-31")
    const [money, violations] = rows("Sample Ridge HOA")
    expect(money).toHaveTextContent("You owe $445.00, $25.00 of it past due. Monthly dues, $420.00, due Nov 1, 2026.")
    expect(violations).toHaveTextContent("1 open. Correct it by Oct 30, 2026.")
  })

  it("says where each area stands for the homeowner, the real ones opening their pages", () => {
    render(
      <HomeownerDashboard
        userName="Casey Morgan"
        overview={quiet}
        summary={published}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [violations, review, rulebook, ...samples] = rows("Sample Ridge HOA")
    expect(violations).toHaveTextContent("No violation is open at your home.")
    expect(review).toHaveTextContent(
      "Of your 3 applications, 1 waits on you, 1 is with the committee and 1 is decided."
    )
    expect(within(review!).getByRole("link")).toHaveAttribute("href", "/applications")
    expect(rulebook).toHaveTextContent("42 rules from 2 governing documents, in force since Oct 7.")
    expect(within(rulebook!).getByRole("link")).toHaveAttribute("href", "/rules")
    expect(samples.map((row) => within(row).getByText("Sample"))).toHaveLength(2)
    expect(samples[0]).toHaveTextContent("1 open request: a streetlight out near your home, reported Sep 30.")
  })

  it("lists what happened to the homeowner's applications and the rules, naming who did each", () => {
    render(
      <HomeownerDashboard
        userName="Casey Morgan"
        overview={quiet}
        summary={published}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

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
        userName="Casey Morgan"
        overview={quiet}
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications/new")
    const [, review, rulebook] = rows("Sample Ridge HOA")
    expect(review).toHaveTextContent("You haven't started an application yet.")
    expect(rulebook).toHaveTextContent("The HOA hasn't published its rules yet.")
    expect(within(rulebook!).queryByRole("link")).not.toBeInTheDocument()
  })
})
