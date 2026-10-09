import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ApplicationListItem } from "../applications.functions"
import { ApplicationsPage, type ApplicationsPageProps, type NewApplication } from "./ApplicationsPage"

const application: ApplicationListItem = {
  id: "app-1",
  hoaId: "hoa",
  projectKind: "fence-work",
  description: "Replace the side fence",
  createdBy: "demo-homeowner",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  status: "submitted",
  reviewId: "r1",
  submittedReviewId: "r1",
  submittedAt: "2026-10-08T11:00:00.000Z",
  decision: null,
  deleteAfter: null,
  recommendation: "request-information",
  projectKindLabel: "Fence"
}

function setup(overrides: Partial<ApplicationsPageProps> = {}) {
  const props: ApplicationsPageProps = {
    applications: [application],
    projectKinds: [
      { key: "fence-work", label: "Fence", description: "Building, replacing or changing a fence or gate." },
      { key: "utility-work", label: "Installation or relocation of utilities", description: null }
    ],
    isCommittee: false,
    onCreate: vi.fn<(input: NewApplication) => Promise<void>>(async () => undefined),
    onOpen: vi.fn<(id: string) => void>(),
    ...overrides
  }
  render(<ApplicationsPage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("ApplicationsPage", () => {
  it("starts an application with the description and packet in one step", async () => {
    const { props, user } = setup()
    const pdf = new File(["%PDF"], "form.pdf", { type: "application/pdf" })
    await user.click(screen.getByRole("radio", { name: "Fence" }))
    await user.type(screen.getByLabelText("Project description"), "  New rear fence  ")
    await user.upload(screen.getByLabelText("Application packet"), pdf)
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(props.onCreate).toHaveBeenCalledWith({
      projectKind: "fence-work",
      description: "New rear fence",
      files: [pdf]
    })
  })

  it("offers the rulebook's project kinds with what each covers, and something else", async () => {
    const { props, user } = setup()
    const picker = screen.getByRole("radiogroup")
    expect(within(picker).getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByText("Building, replacing or changing a fence or gate.")).toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "Something else" }))
    await user.upload(
      screen.getByLabelText("Application packet"),
      new File(["%PDF"], "form.pdf", { type: "application/pdf" })
    )
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ projectKind: null }))
  })

  it("asks for the project type and the packet, and refuses files it can't read", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Choose the kind of project, or Something else.")).toBeInTheDocument()
    expect(screen.getByText("Add your application packet.")).toBeInTheDocument()
    const loose = userEvent.setup({ applyAccept: false })
    await loose.upload(
      screen.getByLabelText("Application packet"),
      new File(["x"], "fence.heic", { type: "image/heic" })
    )
    await user.click(screen.getByRole("radio", { name: "Fence" }))
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText(/Save photos as JPEG or PNG/)).toBeInTheDocument()
    expect(props.onCreate).not.toHaveBeenCalled()
  })

  it("shows why an application wasn't created", async () => {
    const { user } = setup({
      onCreate: vi.fn<(input: NewApplication) => Promise<void>>(async () => {
        throw new Error("Not now.")
      })
    })
    await user.click(screen.getByRole("radio", { name: "Fence" }))
    await user.upload(
      screen.getByLabelText("Application packet"),
      new File(["%PDF"], "form.pdf", { type: "application/pdf" })
    )
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Not now.")).toBeInTheDocument()
  })

  it("lists applications with status and latest recommendation, and opens one", async () => {
    const { props, user } = setup()
    expect(within(screen.getByRole("table")).getByText("Fence")).toBeInTheDocument()
    expect(screen.getByText("With the committee")).toBeInTheDocument()
    expect(screen.getByText("More information needed")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(props.onOpen).toHaveBeenCalledWith("app-1")
  })

  it("shows the committee its queue without the form", () => {
    setup({ isCommittee: true, applications: [] })
    expect(screen.queryByRole("button", { name: "Upload and review" })).not.toBeInTheDocument()
    expect(screen.getByText("Applications appear here once homeowners start them.")).toBeInTheDocument()
  })
})
