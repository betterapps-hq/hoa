import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Application, ApplicationFile } from "@/applications/application"
import type { Job } from "@/jobs/job"
import type { Review } from "@/review/reviewModel"
import { fenceReview } from "@/tests/fenceReview"
import type { ApplicationView } from "../applications.functions"
import type { ReviewAudience } from "../reviewContext"
import { ApplicationPage, type ApplicationActions, type ApplicationPageProps } from "./ApplicationPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const application: Application = {
  id: "app-1",
  hoaId: "hoa",
  projectTypeId: "fence-work",
  answers: null,
  description: "Replace the side fence",
  createdBy: "demo-homeowner",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  status: "reviewed",
  reviewId: "r2",
  submittedReviewId: null,
  submittedAt: null,
  decision: null,
  deleteAfter: null
}

const file = (overrides: Partial<ApplicationFile>): ApplicationFile => ({
  id: "f1",
  hoaId: "hoa",
  applicationId: "app-1",
  parentFileId: null,
  ordinal: null,
  contextText: null,
  fileName: "form.pdf",
  mediaType: "application/pdf",
  sizeBytes: 10,
  sha256: null,
  pageCount: 11,
  kind: null,
  status: "ready",
  error: null,
  createdAt: "2026-10-08T10:00:00.000Z",
  ...overrides
})

const fence = fenceReview()
const review: Review = { ...fence.review, id: "r2", jobId: "r2" }

const view: ApplicationView = {
  application,
  files: [
    file({}),
    file({ id: "f2", fileName: "appendix.docx", pageCount: 1 }),
    file({ id: "f2-p1", parentFileId: "f2", fileName: "picture-1.png", ordinal: 1 }),
    file({
      id: "f3",
      fileName: "scan.pdf",
      status: "unreadable",
      pageCount: null,
      error: { stage: "ocr", message: "Corrupt.", isRetryable: false }
    })
  ],
  review,
  rules: fence.rules,
  terms: fence.terms,
  entityEvidence: [],
  sourceFiles: [],
  projectTypeLabel: "Fence",
  history: [
    { id: "r2", recommendation: "request-information", createdAt: "2026-10-08T11:00:00.000Z" },
    { id: "r1", recommendation: "deny", createdAt: "2026-10-08T10:30:00.000Z" }
  ],
  job: null,
  isOwner: true,
  canEdit: true,
  canDecide: false
}

function setup(overrides: Partial<ApplicationView> = {}, audience: ReviewAudience = "homeowner") {
  const actions = {
    upload: vi.fn<ApplicationActions["upload"]>(async () => undefined),
    removeFile: vi.fn<ApplicationActions["removeFile"]>(async () => undefined),
    runReview: vi.fn<ApplicationActions["runReview"]>(async () => undefined),
    submit: vi.fn<ApplicationActions["submit"]>(async () => undefined),
    decide: vi.fn<ApplicationActions["decide"]>(async () => undefined)
  }
  const props: ApplicationPageProps = {
    view: { ...view, ...overrides },
    audience,
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    actions,
    onChanged: vi.fn<() => void>(),
    onBack: vi.fn<() => void>()
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  render(<ApplicationPage {...props} />, { wrapper })
  return { props, actions, user: userEvent.setup() }
}

const committeeView: Partial<ApplicationView> = {
  application: { ...application, status: "submitted", submittedAt: "2026-10-08T12:00:00.000Z" },
  isOwner: false,
  canEdit: false,
  canDecide: true
}

/** The drop zone's file input, which browsing and dropping both fill. */
function addFilesInput() {
  const input = document.getElementById("add-files")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("No drop zone")
  }
  return input
}

describe("ApplicationPage", () => {
  it("leads with the recommendation and next steps, with the rest a tab away and the details beside", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Fence application" }).nextElementSibling).toHaveTextContent("Reviewed")
    const details = within(screen.getByRole("complementary", { name: "About this application" }))
    expect(details.getByText("Started").nextElementSibling).toHaveTextContent("Oct 8, 2026")
    expect(details.getByText("Files").nextElementSibling).toHaveTextContent("3")
    expect(screen.getByRole("heading", { name: "More information needed" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("form.pdf")).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    for (const name of [/^Rules \d+$/, /^Facts \d+$/, "Files 3", "History 2"]) {
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "false")
    }
  })

  it("gives the rule matrix the page's width, keeping the decision being written", async () => {
    const { user } = setup(committeeView, "committee")
    await user.type(screen.getByLabelText("Note to the homeowner"), "Use a listed color.")
    await user.click(screen.getByRole("tab", { name: /^Rules \d+$/ }))
    expect(screen.queryByRole("complementary", { name: "About this application" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Overview" }))
    expect(screen.getByLabelText("Note to the homeowner")).toHaveValue("Use a listed color.")
  })

  it("goes back to the applications", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Applications" }))
    expect(props.onBack).toHaveBeenCalled()
  })

  it("lists the packet on demand, with pictures and unreadable files, each to open and save, and removes a file", async () => {
    const { actions, props, user } = setup()
    await user.click(screen.getByRole("tab", { name: "Files 3" }))
    expect(screen.getByRole("link", { name: "Open form.pdf" })).toHaveAttribute("href", "/files/applications/app-1/f1")
    expect(screen.getByRole("link", { name: "Download form.pdf" })).toHaveAttribute(
      "href",
      "/files/applications/app-1/f1?download"
    )
    expect(screen.getByText("Read, 1 page, 1 picture")).toBeInTheDocument()
    expect(screen.getByText("Couldn't be read: Corrupt.")).toBeInTheDocument()
    expect(screen.queryByText("picture-1.png")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove form.pdf" }))
    expect(actions.removeFile).toHaveBeenCalledWith("f1")
    expect(props.onChanged).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Run review again" }))
    expect(actions.runReview).toHaveBeenCalled()
  })

  it("makes adding files the one primary action while information is missing, and reviews again", async () => {
    const { actions, user } = setup()
    expect(screen.getByRole("button", { name: "Add files" })).toHaveTextContent("Drag files here, or browse")
    expect(screen.queryByRole("button", { name: "Submit to the committee" })).not.toBeInTheDocument()
    const pdf = new File(["%PDF"], "plan.pdf", { type: "application/pdf" })
    await user.upload(addFilesInput(), pdf)
    await vi.waitFor(() => expect(actions.upload).toHaveBeenCalledWith([pdf]))
    await vi.waitFor(() => expect(actions.runReview).toHaveBeenCalled())
  })

  it("refuses a file type it can't read before uploading", async () => {
    const { actions } = setup()
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(addFilesInput(), new File(["x"], "fence.heic", { type: "image/heic" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Save photos as JPEG or PNG/)
    expect(actions.upload).not.toHaveBeenCalled()
  })

  it("confirms before submitting with open requests", async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole("button", { name: "Submit anyway" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Submit with open requests?")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Submit anyway" }))
    expect(actions.submit).toHaveBeenCalledWith(true)
  })

  it("makes submitting the primary action when nothing is open", async () => {
    const { actions, user } = setup({
      review: { ...review, recommendation: "approve-with-conditions", missingInformation: [] }
    })
    expect(screen.getByRole("heading", { name: "Approvable with conditions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add files" })).toHaveTextContent("Add files")
    expect(screen.getByRole("button", { name: "Submit to the committee" })).toHaveClass("bg-primary")
    await user.click(screen.getByRole("button", { name: "Submit to the committee" }))
    expect(actions.submit).toHaveBeenCalledWith(false)
  })

  it("follows a running review", () => {
    setup({
      application: { ...application, status: "reviewing" },
      files: [file({ status: "processing", pageCount: null })],
      job: { id: "job-1" } as Job
    })
    expect(screen.getByRole("heading", { name: "Reviewing" })).toBeInTheDocument()
    expect(screen.getByText("Reading")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "More information needed" })).not.toBeInTheDocument()
  })

  it("shows why the last review failed", () => {
    setup({
      review: null,
      job: {
        id: "job-1",
        status: "failed",
        error: { stage: "facts", message: "Model unavailable.", isRetryable: true }
      } as Job
    })
    expect(screen.getByText("Model unavailable.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Not reviewed yet" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Run review$/ })).toBeInTheDocument()
  })

  it("lets the committee decide, preselecting the decision that follows the review", async () => {
    const { actions, user } = setup(committeeView, "committee")
    expect(screen.getByRole("heading", { name: "Request more information" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Your decision" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Submit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add files" })).not.toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Information requested Recommended by the review" })).toBeChecked()
    await user.click(screen.getByRole("radio", { name: "Disapproved" }))
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(screen.getByText("Explain the conditions, the parts approved, or what's needed.")).toBeInTheDocument()
    expect(actions.decide).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText("Note to the homeowner"), "Horizontal boards aren't allowed.")
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(actions.decide).toHaveBeenCalledWith("disapproved", "Horizontal boards aren't allowed.")
  })

  it("starts the committee's note from the review's next steps", async () => {
    const { actions, user } = setup(committeeView, "committee")
    await user.click(screen.getByRole("button", { name: "Start from the review’s next steps" }))
    const note = screen.getByLabelText("Note to the homeowner")
    expect(note).toHaveValue(
      [...review.missingInformation, ...review.changes].map((item) => `- ${item.text}`).join("\n")
    )
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(actions.decide).toHaveBeenCalledWith("information-requested", expect.stringMatching(/^- /))
  })

  it("asks the committee to choose when the review leaves it to them", async () => {
    const { actions, user } = setup(
      { ...committeeView, review: { ...review, recommendation: "refer-to-committee", missingInformation: [] } },
      "committee"
    )
    expect(screen.getByRole("heading", { name: "Your judgment needed" })).toBeInTheDocument()
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(screen.getByText("Choose a decision.")).toBeInTheDocument()
    expect(actions.decide).not.toHaveBeenCalled()
  })

  it("shows the committee's decision in place of the recommendation", () => {
    setup({
      application: {
        ...application,
        status: "decided",
        decision: {
          outcome: "disapproved",
          note: "Not allowed.",
          decidedBy: "a",
          decidedAt: "2026-10-09T00:00:00.000Z"
        }
      },
      canEdit: false
    })
    expect(screen.getByText("Committee decision")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Disapproved" })).toBeInTheDocument()
    expect(screen.getByText("Not allowed.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add files" })).not.toBeInTheDocument()
  })
})
