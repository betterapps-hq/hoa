import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { RulebookContent } from "@/db/rulebookContentRepository"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
import { mockActions, noPages, sampleRecords } from "@/tests/rulebookWorkspace"
import type { RulebookSources, RulebookView } from "../rulebook.functions"
import { RulebookPage, type RulebookPageProps } from "./RulebookPage"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn<(message: string) => void>(), {
    error: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    message: vi.fn<(message: string) => void>()
  })
}))

const rulebook = (status: "draft" | "published") => ({
  id: `${status}-1`,
  hoaId: "hoa",
  version: status === "published" ? 1 : null,
  status,
  error: null,
  catalogVersion: 0,
  sourceDocumentIds: ["doc-1"],
  jobId: "job-1",
  createdAt: "",
  publishedBy: null,
  publishedAt: "2026-10-09T00:00:00.000Z"
})

const records = sampleRecords()
const sources: RulebookSources = {
  organization: records.organization,
  documents: records.documents,
  provisions: records.provisions,
  files: []
}
const approved = { status: "approved" as const, by: "admin", at: "2026-10-09T00:00:00Z", note: null }
const content: RulebookContent = {
  settings: records.settings,
  coverage: { provisions: records.provisions.length, uncovered: [] },
  rules: records.rules,
  terms: records.terms,
  questions: records.questions
}

const draft: RulebookView = {
  rulebook: rulebook("draft"),
  content,
  fileSha256: null,
  buildJobId: null,
  isBuilding: false,
  lastBuildError: null,
  isLastBuildStopped: false,
  blockers: ["884 rules and terms still need review."],
  changes: {
    isFirst: false,
    rules: { added: [records.rules[0]!.key], changed: [records.rules[1]!.key], removed: [] },
    terms: { added: [], changed: [], removed: [] },
    settingsChanged: false,
    documents: { added: [{ id: "doc-1", title: "Declaration" }], removed: [] }
  }
}
const published: RulebookView = {
  ...draft,
  rulebook: rulebook("published"),
  content: {
    ...content,
    rules: content.rules.map((rule, index) => (index === 0 ? { ...rule, review: approved } : rule))
  },
  fileSha256: "ab".repeat(32),
  blockers: [],
  changes: null
}

const documents: GoverningDocument[] = [
  {
    id: "doc-1",
    lineageId: "doc-1",
    version: 1,
    hoaId: "hoa",
    kind: "declaration",
    amends: null,
    title: "Declaration",
    effectiveDate: null,
    fileName: "d.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1,
    sha256: "x",
    pageCount: 80,
    status: "ready",
    error: null,
    uploadedBy: "admin",
    uploadedAt: ""
  }
]

function setup(overrides: Partial<RulebookPageProps> = {}) {
  const props: RulebookPageProps = {
    draft,
    published,
    sources,
    uploads: documents,
    jobs: {},
    source: noPages,
    actions: mockActions(),
    isReviewing: false,
    onReviewingChange: vi.fn<(isReviewing: boolean) => void>(),
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    loadRulesFile: vi.fn<() => Promise<string>>(async () => '{"rules":[]}'),
    onUpload: vi.fn<RulebookPageProps["onUpload"]>(async () => undefined),
    onBuild: vi.fn<() => Promise<void>>(async () => undefined),
    onStop: vi.fn<RulebookPageProps["onStop"]>(async () => ({ status: "stopped" })),
    onPublish: vi.fn<(rulebookId: string) => Promise<void>>(async () => undefined),
    onDiscard: vi.fn<(rulebookId: string) => Promise<void>>(async () => undefined),
    onChanged: vi.fn<() => void>(),
    ...overrides
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  render(<RulebookPage {...props} />, { wrapper })
  return { props, user: userEvent.setup() }
}

const noDraft: RulebookView = { ...draft, rulebook: null, content: null, changes: null, blockers: [] }

describe("RulebookPage", () => {
  it("shows the rules in force and the documents, with a ready draft as one sentence and one action", async () => {
    const { props, user } = setup()
    const status = screen.getByRole("region", { name: "Status" })
    expect(within(status).getByText("A new draft of the rulebook is ready to review.")).toBeInTheDocument()
    expect(
      within(status).getByText(/built after Declaration changed\. It adds 1 rule and changes 1 rule\./)
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Rules in force" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Governing documents" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Draft" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument()
    await user.click(within(status).getByRole("button", { name: "Review changes" }))
    expect(props.onReviewingChange).toHaveBeenCalledWith(true)
  })

  it("reviews the draft as a focused mode: the next step, the to-do list, and what changed", async () => {
    const { user } = setup({ isReviewing: true })
    expect(screen.getByText("577 terms need your review before you can publish.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Answer 7 questions" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Changes", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: /^New rules/ })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Review terms" }))
    expect(screen.getByRole("tab", { name: "Terms", selected: true })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Answer 7 questions" }))
    expect(screen.getByRole("tab", { name: "Questions", selected: true })).toBeInTheDocument()
  })

  it("discards the draft after saying what's lost", async () => {
    const { props, user } = setup({ isReviewing: true })
    await user.click(screen.getByRole("button", { name: "Discard draft" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Discard this draft?" })
    expect(within(confirm).getByText(/Version 1 stays in force\./)).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: "Discard draft" }))
    expect(props.onDiscard).toHaveBeenCalledWith("draft-1")
  })

  it("publishes, after confirming, when nothing blocks it", async () => {
    const reviewed = {
      ...content,
      rules: content.rules.map((rule) => ({ ...rule, review: approved })),
      terms: content.terms.map((term) => ({ ...term, review: approved })),
      settings: { ...content.settings, review: approved },
      questions: content.questions.map((question) => ({
        ...question,
        answer: { option: 0, text: null, by: "admin", at: "2026-10-09T00:00:00Z" }
      }))
    }
    const reasonsApproved = {
      ...sources,
      provisions: sources.provisions.map((provision) =>
        provision.noRule ? { ...provision, noRule: { ...provision.noRule, review: approved } } : provision
      )
    }
    const { props, user } = setup({
      isReviewing: true,
      sources: reasonsApproved,
      draft: { ...draft, content: reviewed, blockers: [] }
    })
    expect(screen.getByText(/^Everything is reviewed\./)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Publish" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish" }))
    expect(props.onPublish).toHaveBeenCalledWith("draft-1")
  })

  it("offers to try a failed build again, and downloads the rules file", async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:rules")
    const revokeObjectURL = vi.fn<(url: string) => void>()
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const { props, user } = setup({ draft: { ...noDraft, lastBuildError: "Unit 4 failed." } })
    expect(screen.getByText("Unit 4 failed.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(props.onBuild).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Rules file" }))
    expect(props.loadRulesFile).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("stops a running build after a plain confirmation, and says when it had already finished", async () => {
    const running: Job = {
      id: "job-1",
      hoaId: "hoa",
      kind: "rulebook-build",
      subjectId: "rb",
      status: "running",
      stage: "encode",
      done: 3,
      total: 8,
      promptVersions: {},
      failures: [],
      error: null,
      progress: {
        workload: { concurrency: 4, documents: 1 },
        steps: [
          {
            stage: "structure",
            status: "done",
            isOptional: false,
            done: 1,
            total: 1,
            startedAt: null,
            finishedAt: null
          },
          {
            stage: "encode",
            status: "current",
            isOptional: false,
            done: 3,
            total: 8,
            startedAt: null,
            finishedAt: null
          }
        ]
      },
      createdAt: new Date().toISOString(),
      updatedAt: ""
    }
    const { props, user } = setup({
      draft: { ...noDraft, isBuilding: true, buildJobId: "job-1" },
      loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => running),
      onStop: vi.fn<RulebookPageProps["onStop"]>(async () => ({ status: "already-finished" }))
    })
    expect(await screen.findByText(/Drafting rules, step 2 of 2/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Stop building" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText("Work finished so far is kept and reused next time. Nothing is published.")
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Stop building" }))
    expect(props.onStop).toHaveBeenCalled()
    const { toast } = await import("sonner")
    expect(toast).toHaveBeenCalledWith("The build had already finished, so there was nothing to stop.")
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("says the last build was stopped, with Build a draft as the action", async () => {
    const { props, user } = setup({ draft: { ...noDraft, isLastBuildStopped: true } })
    expect(screen.getByText("The last build was stopped.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Build a draft" }))
    expect(props.onBuild).toHaveBeenCalled()
  })
})
