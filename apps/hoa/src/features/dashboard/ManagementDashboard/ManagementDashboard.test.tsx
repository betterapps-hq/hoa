import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import type { DashboardOverview } from "../overview"
import { ManagementDashboard } from "./ManagementDashboard"

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
    id: "fence",
    projectTypeLabel: "Fence",
    description: "A rear fence.",
    status: "submitted",
    reviews: [{ recommendation: "approve", createdAt: "2026-10-05T11:00:00.000Z" }],
    submittedAt: "2026-10-06T15:00:00.000Z"
  }),
  application({
    id: "porch",
    projectTypeLabel: "Porch",
    description: "A screened porch.",
    status: "submitted",
    reviews: [{ recommendation: "refer-to-committee", createdAt: "2026-09-19T11:00:00.000Z" }],
    submittedAt: "2026-09-20T15:00:00.000Z"
  }),
  application({
    id: "paint",
    projectTypeLabel: null,
    status: "information-requested",
    submittedAt: "2026-09-25T15:00:00.000Z",
    decision: decision("information-requested", "2026-10-01T15:00:00.000Z", "Send the paint chips.")
  })
]

const activity: ActivityEvent[] = [
  {
    id: "fence-submitted",
    at: "2026-10-09T10:00:00.000Z",
    by: "Jordan Avery",
    type: "application-submitted",
    application: { id: "fence", projectTypeLabel: "Fence", description: "A rear fence." },
    again: false
  },
  {
    id: "documents",
    at: "2026-10-08T09:00:00.000Z",
    by: "Sam Rivera",
    type: "documents-added",
    documents: [
      { id: "declaration", title: "Declaration", version: 1 },
      { id: "bylaws", title: "Bylaws", version: 1 }
    ]
  },
  {
    id: "amended",
    at: "2026-10-07T09:00:00.000Z",
    by: null,
    type: "documents-added",
    documents: [{ id: "declaration-2", title: "Declaration", version: 2 }]
  },
  { id: "published", at: "2026-10-07T12:00:00.000Z", by: "Sam Rivera", type: "rulebook-published", version: 3 }
]

/** An association with no units, dues or violations: only what the other areas have. */
const quiet: DashboardOverview = {
  today: "2026-10-09",
  isBoard: true,
  money: null,
  dues: null,
  violations: [],
  homes: [],
  upcoming: []
}

/** Three units, one past due, monthly dues, and a violation waiting on the board. */
const busy: DashboardOverview = {
  ...quiet,
  money: {
    owedCents: 114_500,
    owingUnits: 3,
    unitCount: 3,
    pastDueCents: 2500,
    pastDueUnits: 1,
    pastDueSince: "2026-09-14",
    aging: { current: 112_000, late30: 2500, late60: 0, late90: 0, over90: 0 },
    months: [
      { month: "2026-09", billedCents: 105_000, collectedCents: 100_000 },
      { month: "2026-10", billedCents: 112_000, collectedCents: 50_000 }
    ],
    largest: [
      {
        unitId: "unit-31",
        label: "31 Fir Court",
        owners: ["Casey Morgan"],
        balanceCents: 44_500,
        pastDueCents: 2500,
        pastDueSince: "2026-09-14"
      }
    ]
  },
  dues: { next: { name: "Monthly dues", dueOn: "2026-11-01", totalCents: 112_000 }, latest: null },
  violations: [
    {
      id: "boat",
      title: "A boat in the driveway",
      unit: "31 Fir Court",
      observedOn: "2026-10-02",
      nextStep: { step: "notice", text: "Send the notice", on: null, waitsOn: "board" },
      hearingOn: "2026-10-20"
    }
  ],
  upcoming: [
    {
      id: "hearing:boat",
      kind: "violation",
      violationId: "boat",
      on: "2026-10-20",
      subject: "Hearing",
      note: "A boat in the driveway, at 31 Fir Court."
    },
    {
      id: "dues:dues:2026-11-01",
      kind: "dues",
      unitId: null,
      on: "2026-11-01",
      subject: "Monthly dues due",
      note: "From 3 units."
    }
  ]
}

const card = (heading: string) => screen.getByRole("heading", { name: heading }).closest("[data-slot=card]")
const rows = (heading: string) => within(card(heading) as HTMLElement).getAllByRole("listitem")
/** A card's rows read from the app's records, leaving out the samples for the areas the app doesn't have yet. */
const realRows = (heading: string) => rows(heading).filter((row) => !within(row).queryByText("Sample"))

describe("ManagementDashboard", () => {
  it("lists what needs the HOA's management across its areas, longest waiting first", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={published}
        nextRulebook={{ status: "draft", createdAt: "2026-10-08T00:00:00.000Z", rulesToReview: 12, openQuestions: 2 }}
        applications={applications}
        projectTypesToUpdate={2}
        activity={activity}
        asOf={asOf}
      />
    )

    const [porch, fence, projectTypes, rulebook] = realRows("Needs your attention")
    expect(porch).toHaveTextContent("Porch")
    expect(porch).toHaveTextContent("Waiting 19 days")
    expect(porch).toHaveTextContent("A screened porch.")
    expect(porch).toHaveTextContent("Ready for your decision. Review: refer to the committee.")
    expect(porch).toHaveTextContent("Architectural review")
    expect(within(porch!).getByRole("link")).toHaveAttribute("href", "/applications/porch")
    expect(fence).toHaveTextContent("Fence")
    expect(projectTypes).toHaveTextContent("2 are out of date with the rulebook in force.")
    expect(within(projectTypes!).getByRole("link")).toHaveAttribute("href", "/project-types")
    expect(rulebook).toHaveTextContent("Draft rulebook")
    expect(rulebook).toHaveTextContent("12 rules and 2 questions to review before you publish it.")
    expect(rulebook).toHaveTextContent("Rulebook")
    expect(within(rulebook!).getByRole("link")).toHaveAttribute("href", "/rules/review")
  })

  it("says where each area stands, each opening its page", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={published}
        nextRulebook={null}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [violations, review, rulebook] = realRows("Sample Ridge HOA")
    expect(violations).toHaveTextContent("No violation is open.")
    expect(within(violations!).getByRole("link")).toHaveAttribute("href", "/violations")
    expect(review).toHaveTextContent("Architectural review")
    expect(review).toHaveTextContent("2 applications wait for a decision, and 1 waits on its homeowner.")
    expect(within(review!).getByRole("link")).toHaveAttribute("href", "/applications")
    expect(rulebook).toHaveTextContent("Version 3, with 42 rules, in force since Oct 7.")
    expect(within(rulebook!).getByRole("link")).toHaveAttribute("href", "/rules")
  })

  it("names each event's area and who did it in recent activity, and opens what it's about", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={published}
        nextRulebook={null}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [submitted, added, publishedVersion, amended] = realRows("Recent activity")
    expect(submitted).toHaveTextContent(
      "FenceA rear fence.Submitted to the committee by Jordan AveryArchitectural review2 hours ago"
    )
    expect(within(submitted!).getByRole("link")).toHaveAttribute("href", "/applications/fence")
    expect(added).toHaveTextContent(
      "2 documentsDeclaration and BylawsAdded to the governing documents by Sam RiveraRulebook"
    )
    expect(within(added!).getByRole("link")).toHaveAttribute("href", "/rules")
    expect(amended).toHaveTextContent("New version addedRulebook")
    expect(within(amended!).getByRole("link")).toHaveAttribute("href", "/documents/declaration-2")
    expect(publishedVersion).toHaveTextContent("Version 3Published by Sam RiveraRulebook")
  })

  it("says the documents are being processed into a new draft", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={published}
        nextRulebook={{ status: "building" }}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    const [, , rulebook] = realRows("Sample Ridge HOA")
    expect(rulebook).toHaveTextContent("Your documents are being processed into a new draft.")
    expect(realRows("Needs your attention")).toEqual([])
  })

  it("says so when no application waits and no rulebook is in force", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        nextRulebook={null}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByText("No application is waiting.")).toBeInTheDocument()
    expect(
      screen.getByText("No rulebook is in force yet. Process the governing documents to make one.")
    ).toBeInTheDocument()
    expect(realRows("Recent activity")).toEqual([])
  })

  it("shows the rest of the portal with sample data, each marked as a sample and opening nothing", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={quiet}
        summary={published}
        nextRulebook={null}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    const samples = rows("Needs your attention")
    expect(samples.map((row) => within(row).getByText("Sample"))).toHaveLength(2)
    expect(samples[0]).toHaveTextContent("Streetlight out on Birch Lane")
    expect(samples[0]).toHaveTextContent("Maintenance requests")
    expect(rows("Sample Ridge HOA").map((row) => row.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Meetings and votes")])
    )
    const [meeting] = rows("Coming up")
    expect(meeting).toHaveTextContent("Board meeting")
    expect(meeting).toHaveTextContent("18")
    expect(rows("Recent activity")[0]).toHaveTextContent("Request closed")
    for (const heading of ["Needs your attention", "Coming up", "Recent activity"]) {
      expect(within(card(heading) as HTMLElement).queryAllByRole("link")).toEqual([])
    }
  })

  it("greets the reader, and leads with what's owed, collected, open and waiting", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={busy}
        summary={published}
        nextRulebook={null}
        applications={applications}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByRole("heading", { name: "Welcome back, Sam" })).toBeInTheDocument()
    expect(screen.getByText("Sample Ridge HOA. Friday, October 9, 2026.")).toBeInTheDocument()
    expect(screen.getByText("$1,145.00")).toBeInTheDocument()
    expect(screen.getByText("$25.00 late")).toBeInTheDocument()
    expect(screen.getByText("Collected in October")).toBeInTheDocument()
    expect(screen.getByText("-50%")).toBeInTheDocument()
    expect(screen.getByText("1 waits on the board.")).toBeInTheDocument()
    expect(screen.getByText("The oldest: waiting 19 days.")).toBeInTheDocument()
  })

  it("puts violations and late balances among what needs attention, and their dates among what's coming", () => {
    render(
      <ManagementDashboard
        userName="Sam Rivera"
        overview={busy}
        summary={published}
        nextRulebook={null}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    const [late, boat] = realRows("Needs your attention")
    expect(late).toHaveTextContent("Past-due balances")
    expect(within(late!).getByRole("link")).toHaveAttribute("href", "/ledger")
    expect(boat).toHaveTextContent("A boat in the driveway")
    expect(boat).toHaveTextContent("Send the notice.")
    expect(within(boat!).getByRole("link")).toHaveAttribute("href", "/violations/boat")
    const [hearing, dues] = realRows("Coming up")
    expect(hearing).toHaveTextContent("Hearing")
    expect(within(hearing!).getByRole("link")).toHaveAttribute("href", "/violations/boat")
    expect(within(dues!).getByRole("link")).toHaveAttribute("href", "/dues")
    expect(realRows("Sample Ridge HOA")[0]).toHaveTextContent(
      "$1,145.00 owed by 3 units, $25.00 of it past due. Monthly dues, $1,120.00, due Nov 1, 2026."
    )
    expect(screen.getByText("Late since Sep 14, 2026")).toBeInTheDocument()
  })
})
