import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { RulebookContent } from "@/db/rulebookContentRepository"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookView } from "../rulebook.functions"
import { RulebookPage, type RulebookPageProps } from "./RulebookPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
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

const sample = sampleRulesFile()
const ageRule = sample.rules.find((rule) => rule.key === "declaration:3.1(a)#age-55-occupant")
const content: RulebookContent = {
  settings: sample.settings,
  coverage: { provisions: 3, uncovered: ["declaration:21.4"] },
  rules: sample.rules.slice(0, 2),
  terms: sample.terms,
  questions: []
}

const draft: RulebookView = {
  rulebook: rulebook("draft"),
  content,
  fileSha256: null,
  buildJobId: null,
  isBuilding: false,
  lastBuildError: null,
  blockers: ["2 rules and terms still need review."]
}
const approved = { status: "approved" as const, by: "admin", at: "", note: null }
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
    documents,
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
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

  it("shows the draft's counts, blockers and rules with their terms in words", () => {
    setup()
    expect(screen.getByText("2 rules")).toBeInTheDocument()
    expect(screen.getByText("1 uncovered provisions")).toBeInTheDocument()
    expect(screen.getByText("2 rules and terms still need review.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()
    expect(screen.getByText(ageRule?.title ?? "")).toBeInTheDocument()
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
    expect(screen.getAllByText("To review")).toHaveLength(2)
  })

  it("publishes when nothing blocks it", async () => {
    const { props, user } = setup({ draft: { ...draft, blockers: [] } })
    await user.click(screen.getByRole("button", { name: "Publish" }))
    expect(props.onPublish).toHaveBeenCalledWith("draft-1")
  })

  it("shows the published rulebook's approved rules and file hash", async () => {
    const { user } = setup({ draft: { ...draft, rulebook: null, content: null, lastBuildError: "Unit 4 failed." } })
    expect(screen.getByText("Unit 4 failed.")).toBeInTheDocument()
    expect(screen.getByText(/1 rules, published/)).toBeInTheDocument()
    expect(screen.getByText("ab".repeat(32))).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Draft" }))
    expect(screen.getByText("No draft")).toBeInTheDocument()
  })
})
