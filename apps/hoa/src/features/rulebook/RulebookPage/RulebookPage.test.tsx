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
  toast: {
    error: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    message: vi.fn<(message: string) => void>()
  }
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
  blockers: ["884 rules and terms still need review."]
}
const published: RulebookView = {
  ...draft,
  rulebook: rulebook("published"),
  content: {
    ...content,
    rules: content.rules.map((rule, index) => (index === 0 ? { ...rule, review: approved } : rule))
  },
  fileSha256: "ab".repeat(32),
  blockers: []
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
    documents,
    source: noPages,
    actions: mockActions(),
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    loadRulesFile: vi.fn<() => Promise<string>>(async () => '{"rules":[]}'),
    onBuild: vi.fn<(documentIds: string[]) => Promise<void>>(async () => undefined),
    onPublish: vi.fn<(rulebookId: string) => Promise<void>>(async () => undefined),
    onChanged: vi.fn<() => void>(),
    ...overrides
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  render(<RulebookPage {...props} />, { wrapper })
  return { props, user: userEvent.setup() }
}

describe("RulebookPage", () => {
  it("builds from the chosen documents", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Build rulebook" }))
    expect(props.onBuild).toHaveBeenCalledWith(["doc-1"])
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("shows the draft's counts and what blocks publishing, above its tabs", () => {
    setup()
    expect(screen.getByText("307 rules")).toBeInTheDocument()
    expect(screen.getByText("0 uncovered provisions")).toBeInTheDocument()
    expect(screen.getByText("884 rules and terms still need review.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()
    const tabs = screen.getByRole("tablist", { name: "Rulebook" })
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent)
    ).toEqual(["Rules307 to do", "Vocabulary577 to do", "Coverage246 to do", "Questions7 to do", "Settings1 to do"])
  })

  it("publishes when nothing blocks it", async () => {
    const { props, user } = setup({ draft: { ...draft, blockers: [] } })
    expect(screen.getByText(/Everything is reviewed/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Publish" }))
    expect(props.onPublish).toHaveBeenCalledWith("draft-1")
  })

  it("shows the published rulebook read-only, with its file's hash and download", async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:rules")
    const revokeObjectURL = vi.fn<(url: string) => void>()
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const { props, user } = setup({
      draft: { ...draft, rulebook: null, content: null, lastBuildError: "Unit 4 failed." }
    })
    expect(screen.getByText("Unit 4 failed.")).toBeInTheDocument()
    expect(screen.getByText(/1 rules, published/)).toBeInTheDocument()
    expect(screen.getByText("ab".repeat(32))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Download rules file" }))
    expect(props.loadRulesFile).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalled()
    await user.click(screen.getByRole("tab", { name: "Draft" }))
    expect(screen.getByText("No draft")).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
