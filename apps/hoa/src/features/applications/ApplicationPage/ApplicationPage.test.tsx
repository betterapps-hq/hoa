import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { describe, expect, it, vi } from "vitest"
import type { Application, ApplicationFile } from "@/applications/application"
import type { Job } from "@/jobs/job"
import { emptyAnswers } from "@/projectTypes/answers"
import type { Review } from "@/review/reviewModel"
import { fenceReview } from "@/tests/fenceReview"
import type { ApplicationView } from "../applications.functions"
import { gardenStructure } from "../applications.test-data"
import type { ReviewAudience } from "../reviewContext"
import type { ApplicationUploadApi } from "../uploadApplicationFiles"
import { ApplicationPage, type ApplicationActions, type ApplicationPageProps } from "./ApplicationPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }))

const application: Application = {
  id: "app-1",
  hoaId: "hoa",
  projectTypeId: "fence-work",
  answers: null,
  description: "Replace the side fence",
  createdBy: "demo-homeowner",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  revisedAt: null,
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
  uploadedAs: null,
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
  projectType: null,
  history: [
    { id: "r2", recommendation: "request-information", createdAt: "2026-10-08T11:00:00.000Z" },
    { id: "r1", recommendation: "deny", createdAt: "2026-10-08T10:30:00.000Z" }
  ],
  reviewRulebook: { version: 1, isInForce: true },
  rulesUpdate: null,
  job: null,
  isOwner: true,
  canEdit: true,
  canDecide: false
}

/** A draft of the garden structure type, just started: no answers, no files, no review. */
const draftView: Partial<ApplicationView> = {
  application: {
    ...application,
    projectTypeId: gardenStructure.id,
    answers: emptyAnswers(gardenStructure.definition),
    description: null,
    status: "draft",
    reviewId: null
  },
  files: [],
  review: null,
  history: [],
  projectTypeLabel: gardenStructure.label,
  projectType: gardenStructure
}

function setup(overrides: Partial<ApplicationView> = {}, audience: ReviewAudience = "homeowner") {
  const actions = {
    save: vi.fn<ApplicationActions["save"]>(async () => undefined),
    uploads: {
      createUpload: vi.fn<ApplicationUploadApi["createUpload"]>(async (input) => ({
        fileId: `file-${input.fileName}`,
        uploadUrl: null,
        contentType: input.mediaType
      })),
      uploadThroughServer: vi.fn<ApplicationUploadApi["uploadThroughServer"]>(async () => undefined),
      completeUpload: vi.fn<ApplicationUploadApi["completeUpload"]>(async () => undefined)
    },
    setUploadedAs: vi.fn<ApplicationActions["setUploadedAs"]>(async () => undefined),
    removeFile: vi.fn<ApplicationActions["removeFile"]>(async () => undefined),
    runReview: vi.fn<ApplicationActions["runReview"]>(async () => undefined),
    submit: vi.fn<ApplicationActions["submit"]>(async () => undefined),
    deleteDraft: vi.fn<ApplicationActions["deleteDraft"]>(async () => undefined),
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

/** A drop zone's file input, which browsing and dropping both fill. */
function filesInput(id = "add-files") {
  const input = document.getElementById(id)?.closest("[data-slot=upload]")?.querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("No drop zone")
  }
  return input
}

const pageActions = () => within(screen.getByRole("group", { name: "Page actions" }))
const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" })

describe("ApplicationPage", () => {
  it("leads with the recommendation and next steps, with the rest a tab away and the details beside", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Fence application" }).nextElementSibling).toHaveTextContent("Draft")
    const details = within(screen.getByRole("complementary", { name: "About this application" }))
    expect(details.getByText("Started").nextElementSibling).toHaveTextContent("Oct 8, 2026")
    expect(details.getByText("Files").nextElementSibling).toHaveTextContent("3")
    expect(screen.getByRole("heading", { name: "More information needed" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("form.pdf")).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    for (const name of [/^Rules \d+$/, /^Facts \d+$/, "Application", "Files 3", "History 2"]) {
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "false")
    }
  })

  it("goes back to the applications", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Applications" }))
    expect(props.onBack).toHaveBeenCalled()
  })

  it("lists the packet on demand, with pictures and unreadable files, each to open and save", async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole("tab", { name: "Files 3" }))
    expect(screen.getByRole("link", { name: "Open form.pdf" })).toHaveAttribute("href", "/files/applications/app-1/f1")
    expect(screen.getByRole("link", { name: "Download form.pdf" })).toHaveAttribute(
      "href",
      "/files/applications/app-1/f1?download"
    )
    expect(screen.getByText("Read, 1 page, 1 picture")).toBeInTheDocument()
    expect(screen.getByText("Couldn't be read: Corrupt.")).toBeInTheDocument()
    expect(screen.queryByText("picture-1.png")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "More actions" }))
    await user.click(await screen.findByRole("menuitem", { name: "Run review again" }))
    expect(actions.runReview).toHaveBeenCalled()
  })

  it("removes a file, after which the review no longer covers the application", async () => {
    const { actions, props, user } = setup()
    await user.click(screen.getByRole("tab", { name: "Files 3" }))
    await user.click(screen.getByRole("button", { name: "Remove form.pdf" }))
    expect(actions.removeFile).toHaveBeenCalledWith("f1")
    expect(props.onChanged).toHaveBeenCalled()
    expect(pageActions().getByRole("button", { name: "Run review again" })).toBeInTheDocument()
  })

  it("adds files without running the review, and asks for it again", async () => {
    const { actions, user } = setup()
    expect(screen.getByRole("heading", { name: "Add what’s missing" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit to the committee" })).not.toBeInTheDocument()
    const plan = pdf("plan.pdf")
    await user.upload(filesInput("add-missing-files"), plan)
    await waitFor(() => expect(actions.uploads.completeUpload).toHaveBeenCalledWith("file-plan.pdf"))
    expect(actions.uploads.createUpload).toHaveBeenCalledWith({
      applicationId: application.id,
      fileName: "plan.pdf",
      mediaType: "application/pdf",
      sizeBytes: 4
    })
    expect(actions.runReview).not.toHaveBeenCalled()
    expect(await screen.findByRole("heading", { name: "Run the review again" })).toBeInTheDocument()
    expect(pageActions().getByRole("button", { name: "Run review again" })).toBeInTheDocument()
  })

  it("refuses a file type it can't read before uploading", async () => {
    const { actions } = setup()
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(filesInput("add-missing-files"), new File(["x"], "fence.heic", { type: "image/heic" }))
    expect(
      await screen.findByText("fence.heic isn't a PDF, Word, JPEG or PNG file. Save photos as JPEG or PNG.")
    ).toBeInTheDocument()
    expect(actions.uploads.createUpload).not.toHaveBeenCalled()
  })

  it("confirms before submitting with open requests", async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole("button", { name: "More actions" }))
    await user.click(await screen.findByRole("menuitem", { name: "Submit anyway" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Submit with open requests?")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Submit anyway" }))
    expect(actions.submit).toHaveBeenCalledWith(true)
  })

  it("makes submitting the page's main action when nothing is open", async () => {
    const { actions, user } = setup({
      review: { ...review, recommendation: "approve-with-conditions", missingInformation: [] }
    })
    expect(screen.getByRole("heading", { name: "Approvable with conditions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add files" })).toHaveTextContent("Add files")
    const submit = pageActions().getByRole("button", { name: "Submit to the committee" })
    expect(submit).toHaveClass("bg-primary")
    await user.click(submit)
    expect(actions.submit).toHaveBeenCalledWith(false)
  })

  it("won't submit a review the application changed after, and asks for it again", () => {
    setup({
      application: { ...application, revisedAt: "2026-10-08T12:00:00.000Z" },
      review: { ...review, recommendation: "approve-with-conditions", missingInformation: [] }
    })
    expect(screen.getByRole("heading", { name: "Run the review again" })).toBeInTheDocument()
    expect(pageActions().getByRole("button", { name: "Run review again" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit to the committee" })).not.toBeInTheDocument()
  })

  it("names the rules a newer rulebook changed, and asks for the review again before submitting", () => {
    const change = (title: string) => ({ key: title, title, change: "changed" as const })
    setup({
      review: { ...review, recommendation: "approve-with-conditions", missingInformation: [] },
      reviewRulebook: { version: 1, isInForce: false },
      rulesUpdate: {
        version: 2,
        publishedAt: "2026-10-12T12:00:00.000Z",
        changes: ["fence height", "fence materials", "setbacks", "colors"].map(change)
      }
    })
    const card = screen.getByRole("heading", { name: "The rules changed" }).closest("[data-slot=card]")
    if (!(card instanceof HTMLElement)) {
      throw new Error("No card")
    }
    expect(card).toHaveTextContent(/Version 2 of the rulebook, published Oct 12, 2026, changes 4 rules your review/)
    expect(
      within(card)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Fence height", "Fence materials", "Setbacks", "1 more"])
    expect(pageActions().getByRole("button", { name: "Run review again" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit to the committee" })).not.toBeInTheDocument()
    const details = within(screen.getByRole("complementary", { name: "About this application" }))
    expect(details.getByText("Rulebook").nextElementSibling).toHaveTextContent("Version 1, since replaced")
  })

  it("follows a running review", () => {
    setup({
      application: { ...application, status: "reviewing" },
      files: [file({ status: "processing", pageCount: null })],
      job: { id: "job-1" } as Job,
      canEdit: false
    })
    expect(screen.getByRole("heading", { name: "Reviewing" })).toBeInTheDocument()
    expect(screen.getByText("Reading")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "More information needed" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Page actions" })).not.toBeInTheDocument()
  })

  it("shows why the last review failed", () => {
    setup({
      application: { ...application, status: "draft" },
      review: null,
      job: {
        id: "job-1",
        status: "failed",
        error: { stage: "facts", message: "Model unavailable.", isRetryable: true }
      } as Job
    })
    expect(screen.getByText("Model unavailable.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Your project" })).toBeInTheDocument()
    expect(pageActions().getByRole("button", { name: "Run review" })).toBeInTheDocument()
  })

  describe("as a draft", () => {
    it("keeps the description and answers as they're typed, without a save button", async () => {
      const { actions, user } = setup(draftView)
      expect(screen.getByRole("heading", { name: "Garden structure application" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument()
      await user.type(screen.getByRole("textbox", { name: "Describe your project" }), "A pergola")
      await user.type(screen.getByRole("textbox", { name: /^How tall is it/ }), "72")
      expect(pageActions().getByText("Saving")).toBeInTheDocument()
      await waitFor(
        () =>
          expect(actions.save).toHaveBeenLastCalledWith({
            description: "A pergola",
            answers: {
              work: [{ "work.performed-by": null }],
              structure: [{ "structure.height": 72, "structure.material": null }]
            }
          }),
        { timeout: 3000 }
      )
      await waitFor(() => expect(pageActions().getByText("Saved")).toBeInTheDocument())
    })

    it("runs the review only once the required questions are answered and a file is added", async () => {
      const { actions, user } = setup(draftView)
      await user.click(pageActions().getByRole("button", { name: "Run review" }))
      expect(toast.error).toHaveBeenCalledWith("Answer the questions marked as required first.")
      expect(screen.getByText("Answer this question.")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole("textbox", { name: /^How tall is it/ })).toHaveFocus())
      await user.type(screen.getByRole("textbox", { name: /^How tall is it/ }), "72")
      await user.click(pageActions().getByRole("button", { name: "Run review" }))
      expect(toast.error).toHaveBeenCalledWith("Add your application packet first.")
      expect(screen.getByText("Add your application packet.")).toBeInTheDocument()
      expect(actions.runReview).not.toHaveBeenCalled()
    })

    it("saves what's waiting before the review runs", async () => {
      const { actions, user } = setup({ ...draftView, files: [file({ uploadedAs: "site-plan" })] })
      await user.type(screen.getByRole("textbox", { name: /^How tall is it/ }), "72")
      await user.click(pageActions().getByRole("button", { name: "Run review" }))
      await waitFor(() => expect(actions.runReview).toHaveBeenCalled())
      expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ answers: expect.anything() }))
      expect(actions.save.mock.invocationCallOrder[0]).toBeLessThan(actions.runReview.mock.invocationCallOrder[0]!)
    })

    it("uploads files as what their names say, where the format suits", async () => {
      const { actions, user } = setup(draftView)
      expect(screen.getByText(/Still needed: site plan\./)).toBeInTheDocument()
      const sitePlan = pdf("Site_Plan.pdf")
      const photo = new File(["x"], "site plan.jpg", { type: "image/jpeg" })
      await user.upload(filesInput(), [sitePlan, photo])
      // The site plan takes PDFs only, so the photo isn't taken as one.
      await waitFor(() => expect(actions.uploads.completeUpload).toHaveBeenCalledTimes(2))
      expect(actions.uploads.createUpload.mock.calls.map(([input]) => [input.fileName, input.uploadedAs])).toEqual([
        ["Site_Plan.pdf", "site-plan"],
        ["site plan.jpg", undefined]
      ])
    })

    it("says what each file is, and ticks off the documents it covers", async () => {
      const { actions, user } = setup({
        ...draftView,
        files: [file({ uploadedAs: "site-plan" }), file({ id: "f2", fileName: "yard.jpg", mediaType: "image/jpeg" })]
      })
      expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
      expect(screen.getByRole("combobox", { name: "What form.pdf is" })).toHaveValue("site-plan")
      const yard = screen.getByRole("combobox", { name: "What yard.jpg is" })
      await user.selectOptions(yard, "site-plan")
      expect(toast.error).toHaveBeenCalledWith("The site plan takes PDF files; yard.jpg isn't one.")
      expect(yard).toHaveValue("")
      await user.selectOptions(yard, "photo")
      expect(actions.setUploadedAs).toHaveBeenCalledWith("f2", "photo")
      expect(yard).toHaveValue("photo")
    })

    it("deletes the draft after asking", async () => {
      const { actions, props, user } = setup(draftView)
      await user.click(screen.getByRole("button", { name: "More actions" }))
      await user.click(await screen.findByRole("menuitem", { name: "Delete the draft" }))
      const dialog = await screen.findByRole("alertdialog")
      expect(within(dialog).getByText("Delete this draft?")).toBeInTheDocument()
      await user.click(within(dialog).getByRole("button", { name: "Delete the draft" }))
      await waitFor(() => expect(actions.deleteDraft).toHaveBeenCalled())
      expect(props.onBack).toHaveBeenCalled()
    })

    it("can't be deleted once it's been submitted", async () => {
      const { user } = setup({
        application: { ...application, status: "information-requested", submittedAt: "2026-10-08T12:00:00.000Z" }
      })
      await user.click(screen.getByRole("button", { name: "More actions" }))
      expect(await screen.findByRole("menuitem", { name: "Run review again" })).toBeInTheDocument()
      expect(screen.queryByRole("menuitem", { name: "Delete the draft" })).not.toBeInTheDocument()
    })
  })

  it("shows the committee the description and answers as given", async () => {
    const { user } = setup(
      {
        ...committeeView,
        application: {
          ...application,
          status: "submitted",
          submittedAt: "2026-10-08T12:00:00.000Z",
          projectTypeId: gardenStructure.id,
          answers: { work: [{ "work.performed-by": "Me" }], structure: [{ "structure.height": 72 }] }
        },
        projectType: gardenStructure
      },
      "committee"
    )
    await user.click(screen.getByRole("tab", { name: "Application" }))
    expect(screen.getByText("Who does the work? Me")).toBeInTheDocument()
    expect(screen.getByText("How tall is it? 72 inches")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /^How tall is it/ })).not.toBeInTheDocument()
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
