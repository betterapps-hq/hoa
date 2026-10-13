import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ApplicationListItem } from "../applications.functions"
import { ApplicationsPage, type ApplicationsPageProps } from "./ApplicationsPage"

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }))

const application: ApplicationListItem = {
  id: "app-1",
  hoaId: "hoa",
  projectTypeId: "type-1",
  answers: null,
  description: "Add a structure in the yard",
  createdBy: "demo-homeowner",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  revisedAt: "2026-10-08T10:30:00.000Z",
  status: "submitted",
  reviewId: "r1",
  submittedReviewId: "r1",
  submittedAt: "2026-10-08T11:00:00.000Z",
  decision: null,
  deleteAfter: null,
  recommendation: "request-information",
  projectTypeLabel: "Garden structure"
}

const draft: ApplicationListItem = {
  ...application,
  id: "app-2",
  description: null,
  status: "reviewed",
  submittedReviewId: null,
  submittedAt: null,
  recommendation: "approve"
}

function setup(overrides: Partial<ApplicationsPageProps> = {}) {
  const props: ApplicationsPageProps = {
    applications: [application],
    isCommittee: false,
    onOpen: vi.fn<(id: string) => void>(),
    ...overrides
  }
  render(<ApplicationsPage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("ApplicationsPage", () => {
  it("makes starting an application the page's action, on a page of its own", () => {
    setup()
    const start = within(screen.getByRole("group", { name: "Page actions" })).getByRole("link", {
      name: "Start an application"
    })
    expect(start).toHaveAttribute("href", "/applications/new")
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument()
  })

  it("lists applications with status and latest recommendation, and opens one", async () => {
    const { props, user } = setup()
    expect(within(screen.getByRole("table")).getByText("Garden structure")).toBeInTheDocument()
    expect(screen.getByText("With the committee")).toBeInTheDocument()
    expect(screen.getByText("More information needed")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(props.onOpen).toHaveBeenCalledWith("app-1")
  })

  it("calls an application a draft until it's submitted, reviewed or not", () => {
    setup({ applications: [draft] })
    expect(within(screen.getByRole("table")).getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Approve")).toBeInTheDocument()
  })

  it("shows the committee its queue, with nothing to start", () => {
    setup({ isCommittee: true, applications: [] })
    expect(screen.queryByRole("group", { name: "Page actions" })).not.toBeInTheDocument()
    expect(screen.getByText("Applications appear here once homeowners submit them.")).toBeInTheDocument()
  })
})
