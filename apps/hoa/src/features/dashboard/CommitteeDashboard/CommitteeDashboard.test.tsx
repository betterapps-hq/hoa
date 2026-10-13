import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
import { dashboardApplication as application, decision } from "../dashboard.test-data"
import { CommitteeDashboard } from "./CommitteeDashboard"

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
  hoaName: "Sample Ridge HOA",
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

const card = (heading: string) => screen.getByRole("heading", { name: heading }).closest("[data-slot=card]")
const rows = (heading: string) => within(card(heading) as HTMLElement).getAllByRole("listitem")

describe("CommitteeDashboard", () => {
  it("lists what needs the committee across the HOA's areas, longest waiting first", () => {
    render(
      <CommitteeDashboard
        summary={published}
        nextRulebook={{ status: "draft", createdAt: "2026-10-08T00:00:00.000Z", rulesToReview: 12, openQuestions: 2 }}
        applications={applications}
        projectTypesToUpdate={2}
        activity={activity}
        asOf={asOf}
      />
    )

    const [porch, fence, projectTypes, rulebook] = rows("Needs your attention")
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
      <CommitteeDashboard
        summary={published}
        nextRulebook={null}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [review, rulebook] = rows("Sample Ridge HOA")
    expect(review).toHaveTextContent("Architectural review")
    expect(review).toHaveTextContent("2 applications wait for a decision, and 1 waits on its homeowner.")
    expect(within(review!).getByRole("link")).toHaveAttribute("href", "/applications")
    expect(rulebook).toHaveTextContent("Version 3, with 42 rules, in force since Oct 7.")
    expect(within(rulebook!).getByRole("link")).toHaveAttribute("href", "/rules")
  })

  it("names each event's area and who did it in recent activity, and opens what it's about", () => {
    render(
      <CommitteeDashboard
        summary={published}
        nextRulebook={null}
        applications={applications}
        activity={activity}
        asOf={asOf}
      />
    )

    const [submitted, added, amended, publishedVersion] = rows("Recent activity")
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
      <CommitteeDashboard
        summary={published}
        nextRulebook={{ status: "building" }}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    const [, rulebook] = rows("Sample Ridge HOA")
    expect(rulebook).toHaveTextContent("Your documents are being processed into a new draft.")
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument()
  })

  it("says so when nothing waits, no rulebook is in force and nothing happened", () => {
    render(
      <CommitteeDashboard
        summary={{ ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }}
        nextRulebook={null}
        applications={[]}
        activity={[]}
        asOf={asOf}
      />
    )

    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument()
    expect(screen.getByText("No application is waiting.")).toBeInTheDocument()
    expect(
      screen.getByText("No rulebook is in force yet. Process the governing documents to make one.")
    ).toBeInTheDocument()
    expect(screen.getByText("Nothing has happened yet.")).toBeInTheDocument()
  })
})
