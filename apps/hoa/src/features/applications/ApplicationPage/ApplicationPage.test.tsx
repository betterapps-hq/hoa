import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Application, ApplicationFile } from "@/applications/application"
import type { Job } from "@/jobs/job"
import type { Review } from "@/review/reviewModel"
import type { ReviewRule } from "@/review/reviewRules"
import type { Finding } from "@/schema/types"
import type { ApplicationView } from "../applications.functions"
import { ApplicationPage, type ApplicationActions, type ApplicationPageProps } from "./ApplicationPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

const application: Application = {
  id: "app-1",
  hoaId: "hoa",
  projectKind: "fence-work",
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

const finding = (ruleKey: string, entity: string, outcome: Finding["outcome"], reason: string): Finding => ({
  ruleKey,
  entity,
  outcome,
  remedy: null,
  reason,
  inputs: [],
  modifiedBy: [],
  judgment: null,
  statements: [],
  effects: [],
  sanction: null,
  asOf: "2026-10-08",
  evaluatedAt: "2026-10-08T11:00:00.000Z"
})

const colors = "guidelines:5.4.2(i)#colors"
const review: Review = {
  id: "r2",
  applicationId: "app-1",
  jobId: "r2",
  rulebookId: "rb",
  rulesFileSha256: "a".repeat(64),
  request: {
    organizationId: "hoa",
    type: "architectural-application",
    governingDate: "2026-10-08",
    evaluationDate: "2026-10-08",
    lot: "lot",
    entities: [{ id: "run-1", type: "fence-run", label: "Left side run", ref: null }],
    facts: [],
    documents: []
  },
  provisional: true,
  selected: [colors],
  documents: [],
  normalizations: [],
  judgments: [],
  conditionAnswers: [],
  findings: [
    finding(colors, "run-1", "not-met", "River Birch isn't a Trex color."),
    finding("unknown-rule", "request", "met", "Fine.")
  ],
  recommendation: "request-information",
  changes: [
    { id: "change-1", ruleKey: colors, entities: ["run-1"], text: `Choose a listed {{rule:${colors}}} color.` }
  ],
  missingInformation: [{ id: "provide-1", ruleKey: "x", entities: ["run-1"], text: "Give the fence height." }],
  committeeDecisions: [{ id: "committee-1", ruleKey: "y", entities: ["run-1"], text: "Do the posts match?" }],
  suggestions: [],
  assessment: "For the committee: request information.",
  feedback: "Please give the height and pick a listed color.",
  promptVersions: {},
  costUsd: 0.2,
  durationMs: 1000,
  sessionId: "r2",
  createdAt: "2026-10-08T11:00:00.000Z"
}

const rule: ReviewRule = {
  key: colors,
  title: "Trex colors",
  statement: "A composite {{fence-run}} uses its manufacturer's listed colors.",
  citations: [
    {
      provisionKey: "guidelines:5.4.2(i)",
      label: "5.4.2(i)",
      documentTitle: "Design Guidelines",
      text: "Composite colors by manufacturer.",
      anchors: []
    }
  ]
}

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
  rules: [rule],
  projectKindLabel: "Fence",
  history: [
    { id: "r2", recommendation: "request-information", createdAt: "2026-10-08T11:00:00.000Z" },
    { id: "r1", recommendation: "deny", createdAt: "2026-10-08T10:30:00.000Z" }
  ],
  job: null,
  isOwner: true,
  canEdit: true,
  canDecide: false
}

function setup(overrides: Partial<ApplicationView> = {}) {
  const actions = {
    upload: vi.fn<ApplicationActions["upload"]>(async () => undefined),
    removeFile: vi.fn<ApplicationActions["removeFile"]>(async () => undefined),
    runReview: vi.fn<ApplicationActions["runReview"]>(async () => undefined),
    submit: vi.fn<ApplicationActions["submit"]>(async () => undefined),
    decide: vi.fn<ApplicationActions["decide"]>(async () => undefined)
  }
  const props: ApplicationPageProps = {
    view: { ...view, ...overrides },
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    actions,
    onChanged: vi.fn<() => void>()
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  render(<ApplicationPage {...props} />, { wrapper })
  return { props, actions, user: userEvent.setup() }
}

describe("ApplicationPage", () => {
  it("lists the packet with pictures and unreadable files, and removes a file", async () => {
    const { actions, props, user } = setup()
    expect(screen.getByText("Read, 1 page, 1 picture")).toBeInTheDocument()
    expect(screen.getByText("Couldn't be read: Corrupt.")).toBeInTheDocument()
    expect(screen.queryByText("picture-1.png")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove form.pdf" }))
    expect(actions.removeFile).toHaveBeenCalledWith("f1")
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("uploads chosen files and runs the review", async () => {
    const { actions, user } = setup()
    const pdf = new File(["%PDF"], "plan.pdf", { type: "application/pdf" })
    await user.upload(screen.getByLabelText("Add files"), pdf)
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(actions.upload).toHaveBeenCalledWith([pdf])
    expect(actions.runReview).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Run review again/ }))
    expect(actions.runReview).toHaveBeenCalledTimes(2)
  })

  it("refuses a file type it can't read before uploading", async () => {
    setup()
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText("Add files"), new File(["x"], "fence.heic", { type: "image/heic" }))
    expect(screen.getByText(/Save photos as JPEG or PNG/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload and review" })).toBeDisabled()
  })

  it("shows the homeowner the review: feedback, changes, requests, committee items and findings", async () => {
    const { user } = setup()
    expect(screen.getByText("Please give the height and pick a listed color.")).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "What to change" })).getByText("Choose a listed Trex colors color.")
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "What to provide" })).getByText("Give the fence height.")
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "For the committee" })).getByText("Do the posts match?")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Not met (1)" }))
    expect(screen.getByText("River Birch isn't a Trex color.")).toBeInTheDocument()
    expect(screen.getByText("(Left side run)")).toBeInTheDocument()
    expect(screen.getByText("Design Guidelines 5.4.2(i)")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Met (1)" }))
    expect(screen.getByText("unknown-rule")).toBeInTheDocument()
    expect(screen.getByText(/Deny/)).toBeInTheDocument()
  })

  it("confirms before submitting with open requests", async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByText("Submit with open requests?")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Submit anyway" }))
    expect(actions.submit).toHaveBeenCalledWith(true)
  })

  it("submits without asking when nothing is open", async () => {
    const { actions, user } = setup({
      review: { ...review, recommendation: "approve-with-conditions", missingInformation: [] }
    })
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(actions.submit).toHaveBeenCalledWith(false)
  })

  it("follows a running review and explains a failed one", () => {
    setup({
      application: { ...application, status: "reviewing" },
      files: [file({ status: "processing", pageCount: null })],
      job: { id: "job-1" } as Job
    })
    expect(screen.getByText("Reading")).toBeInTheDocument()
    expect(
      screen.getByText("Reading the packet and checking it against the rulebook. This takes a few minutes.")
    ).toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: /^Run review$/ })).toBeInTheDocument()
  })

  it("lets the committee decide, requiring a note unless approved", async () => {
    const { actions, user } = setup({
      application: { ...application, status: "submitted" },
      isOwner: false,
      canEdit: false,
      canDecide: true
    })
    expect(screen.getByText("For the committee: request information.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "Disapproved" }))
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(screen.getByText("Explain the conditions, the parts approved, or what's needed.")).toBeInTheDocument()
    expect(actions.decide).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText("Note to the homeowner"), "Horizontal boards aren't allowed.")
    await user.click(screen.getByRole("button", { name: "Record decision" }))
    expect(actions.decide).toHaveBeenCalledWith("disapproved", "Horizontal boards aren't allowed.")
  })

  it("shows the committee's decision", () => {
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
    expect(screen.getByText("Committee decision: Disapproved")).toBeInTheDocument()
    expect(screen.getByText("Not allowed.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Add files")).not.toBeInTheDocument()
  })
})
