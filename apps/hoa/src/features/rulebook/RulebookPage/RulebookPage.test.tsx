import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { Job } from "@/jobs/job"
import type { Rule } from "@/rules/rule"
import { fenceRules } from "@/tests/fenceRulebook"
import type { RulebookView } from "../rulebook.functions"
import type { RuleChanges } from "../rulebookEditing"
import type { RuleCardActions } from "../RuleCard/RuleCard"
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
  catalogVersion: 1,
  sourceDocumentIds: ["doc-1"],
  jobId: "job-1",
  createdAt: "",
  publishedBy: null,
  publishedAt: null
})

const pending = (rule: Rule): Rule => ({ ...rule, review: { ...rule.review, status: "pending" } })
const colors = pending({
  ...fenceRules.find((rule) => rule.id === "composite-colors")!,
  issues: [{ code: "conflict", message: "The CC&Rs list other colors.", resolution: null }]
})
const unverified = pending({
  ...fenceRules.find((rule) => rule.id === "posts")!,
  issues: [{ code: "citation-not-found", message: "The quote wasn't found on page 17.", resolution: null }]
})

const draft: RulebookView = {
  rulebook: rulebook("draft"),
  rules: [colors, unverified],
  removed: [{ ruleKey: "k", title: "No vinyl", citations: [] }],
  buildJobId: null,
  isBuilding: false,
  lastBuildError: null,
  blockers: ["2 rules are still pending."]
}
const published: RulebookView = {
  ...draft,
  rulebook: rulebook("published"),
  rules: fenceRules.slice(0, 2),
  removed: [],
  blockers: []
}

const documents: GoverningDocument[] = [
  {
    id: "doc-1",
    lineageId: "doc-1",
    version: 1,
    hoaId: "hoa",
    kind: "design-guidelines",
    amends: null,
    title: "Design guidelines",
    effectiveDate: null,
    fileName: "g.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1,
    sha256: "x",
    pageCount: 56,
    status: "ready",
    error: null,
    uploadedBy: "admin",
    uploadedAt: ""
  }
]

const card = (title: string) =>
  screen.getByText(title, { selector: "[data-slot=card-title]" }).closest<HTMLElement>("[data-slot=card]")!

function setup(overrides: Partial<RulebookPageProps> = {}) {
  const actions = {
    review: vi.fn<RuleCardActions["review"]>(async () => undefined),
    save: vi.fn<(ruleId: string, changes: RuleChanges) => Promise<void>>(async () => undefined),
    resolveIssue: vi.fn<RuleCardActions["resolveIssue"]>(async () => undefined)
  }
  const props: RulebookPageProps = {
    draft,
    published,
    documents,
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    onBuild: vi.fn<(documentIds: string[]) => Promise<void>>(async () => undefined),
    onApproveReady: vi.fn<() => Promise<number>>(async () => 3),
    onPublish: vi.fn<(rulebookId: string) => Promise<void>>(async () => undefined),
    actions,
    onChanged: vi.fn<() => void>(),
    ...overrides
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  render(<RulebookPage {...props} />, { wrapper })
  return { props, actions, user: userEvent.setup() }
}

describe("RulebookPage", () => {
  it("builds from the chosen documents", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Build rulebook" }))
    expect(props.onBuild).toHaveBeenCalledWith(["doc-1"])
    expect(props.onChanged).toHaveBeenCalled()
  })

  it("shows the draft grouped by topic, with blockers, removed rules and a disabled publish", () => {
    setup()
    expect(screen.getByText("2 pending")).toBeInTheDocument()
    expect(screen.getByText("2 rules are still pending.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()
    expect(screen.getByText(/No vinyl/)).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Colors" })).getByText("Composite colors", {
        selector: "[data-slot=card-title]"
      })
    ).toBeInTheDocument()
    expect(screen.getByText("The CC&Rs list other colors.")).toBeInTheDocument()
  })

  it("approves, rejects, and won't approve a rule whose quote wasn't found", async () => {
    const { actions, user } = setup()
    const colorCard = card("Composite colors")
    await user.click(within(colorCard).getByRole("button", { name: "Approve" }))
    expect(actions.review).toHaveBeenCalledWith("composite-colors", "approved")
    await user.click(within(colorCard).getByRole("button", { name: "Reject" }))
    expect(actions.review).toHaveBeenCalledWith("composite-colors", "rejected")

    const postsCard = card("Posts match")
    expect(within(postsCard).getByRole("button", { name: "Approve" })).toBeDisabled()
  })

  it("resolves an issue with a note", async () => {
    const { actions, user } = setup()
    const colorCard = card("Composite colors")
    await user.click(within(colorCard).getByRole("button", { name: "Resolve" }))
    await user.type(within(colorCard).getByLabelText("Why this is resolved"), "The guidelines are newer")
    await user.click(within(colorCard).getByRole("button", { name: "Save" }))
    expect(actions.resolveIssue).toHaveBeenCalledWith("composite-colors", 0, "The guidelines are newer")
  })

  it("edits a rule and saves the changes", async () => {
    const { actions, user } = setup()
    const colorCard = card("Composite colors")
    await user.click(within(colorCard).getByRole("button", { name: "Edit" }))
    const title = within(colorCard).getByLabelText("Title")
    await user.clear(title)
    await user.type(title, "Composite fence colors")
    await user.selectOptions(within(colorCard).getByLabelText("Who decides"), "committee")
    await user.click(within(colorCard).getByRole("button", { name: "Save" }))
    expect(actions.save).toHaveBeenCalledWith(
      "composite-colors",
      expect.objectContaining({ title: "Composite fence colors", discretion: "committee", isCurable: true })
    )
  })

  it("shows the published rulebook read-only, and an empty draft", async () => {
    const { user } = setup({
      draft: { ...draft, rulebook: null, rules: [], removed: [], blockers: [], lastBuildError: "Section 5 failed." }
    })
    expect(screen.getByText("Section 5 failed.")).toBeInTheDocument()
    expect(screen.getByText("No draft")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /Published/ }))
    expect(card("Fence materials")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
  })

  it("publishes when nothing blocks it", async () => {
    const { props, user } = setup({ draft: { ...draft, blockers: [] } })
    await user.click(screen.getByRole("button", { name: "Publish" }))
    expect(props.onPublish).toHaveBeenCalledWith("draft-1")
  })

  it("approves every ready rule at once", async () => {
    const ready = pending(fenceRules.find((rule) => rule.id === "materials")!)
    const { props, user } = setup({ draft: { ...draft, rules: [colors, unverified, ready] } })
    await user.click(screen.getByRole("button", { name: "Approve all ready (1)" }))
    expect(props.onApproveReady).toHaveBeenCalled()
    expect(props.onChanged).toHaveBeenCalled()
  })
})
