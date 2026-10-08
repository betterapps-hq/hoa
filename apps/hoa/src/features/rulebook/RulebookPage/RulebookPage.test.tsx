import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
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

/** Opens a rule from the table in its side panel. */
async function openRule(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole("button", { name: title }))
  return screen.getByRole("dialog")
}

function setup(overrides: Partial<RulebookPageProps> = {}) {
  const actions = {
    review: vi.fn<RuleCardActions["review"]>(async () => undefined),
    save: vi.fn<(ruleId: string, changes: RuleChanges) => Promise<void>>(async () => undefined),
    resolveIssue: vi.fn<RuleCardActions["resolveIssue"]>(async () => undefined),
    remove: vi.fn<RuleCardActions["remove"]>(async () => undefined),
    addCitation: vi.fn<RuleCardActions["addCitation"]>(async () => undefined),
    replaceCitation: vi.fn<RuleCardActions["replaceCitation"]>(async () => undefined),
    removeCitation: vi.fn<RuleCardActions["removeCitation"]>(async () => undefined)
  }
  const props: RulebookPageProps = {
    draft,
    published,
    documents,
    loadJob: vi.fn<(jobId: string) => Promise<Job | null>>(async () => null),
    onBuild: vi.fn<(documentIds: string[]) => Promise<void>>(async () => undefined),
    onApproveReady: vi.fn<() => Promise<number>>(async () => 3),
    onPublish: vi.fn<(rulebookId: string) => Promise<void>>(async () => undefined),
    onEditPublished: vi.fn<() => Promise<void>>(async () => undefined),
    onDiscardDraft: vi.fn<() => Promise<void>>(async () => undefined),
    actions,
    source: {
      documents: [{ id: "guidelines", title: "Design guidelines", pageCount: 56 }],
      loadPage: vi.fn<CitationSource["loadPage"]>(async (documentId, pageIndex) => ({
        documentId,
        title: "Design guidelines",
        pageCount: 56,
        pageIndex,
        pageLabel: String(pageIndex),
        text: "Fence colors are limited to the following: Trex in Winchester Grey or Saddle."
      }))
    },
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

  it("lists the draft with blockers and removed rules, starting with what needs attention", () => {
    setup()
    expect(screen.getByText("2 pending")).toBeInTheDocument()
    expect(screen.getByText("2 rules are still pending.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()
    expect(screen.getByText(/No vinyl/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Needs attention (2)" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Showing 2 of 2 rules")).toBeInTheDocument()
    expect(screen.getAllByText("Open issues:")).toHaveLength(2)
  })

  it("filters by text, topic and status", async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText("Search rules"), "posts")
    expect(screen.getByText("Showing 1 of 2 rules")).toBeInTheDocument()
    await user.clear(screen.getByLabelText("Search rules"))
    await user.selectOptions(screen.getByLabelText("Topic"), "color")
    expect(screen.getByRole("button", { name: "Composite colors" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Posts match" })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Topic"), "all")
    await user.click(screen.getByRole("button", { name: "Approved" }))
    expect(screen.getByText("No rules match.")).toBeInTheDocument()
  })

  it("approves, rejects, and won't approve a rule whose quote wasn't found", async () => {
    const { actions, user } = setup()
    const colors = await openRule(user, "Composite colors")
    await user.click(within(colors).getByRole("button", { name: "Approve" }))
    expect(actions.review).toHaveBeenCalledWith("composite-colors", "approved")
    await user.click(within(colors).getByRole("button", { name: "Reject" }))
    expect(actions.review).toHaveBeenCalledWith("composite-colors", "rejected")
    await user.keyboard("{Escape}")
    const posts = await openRule(user, "Posts match")
    expect(within(posts).getByRole("button", { name: "Approve" })).toBeDisabled()
  })

  it("resolves an issue with a note", async () => {
    const { actions, user } = setup()
    const panel = await openRule(user, "Composite colors")
    expect(within(panel).getByText("The CC&Rs list other colors.")).toBeInTheDocument()
    await user.click(within(panel).getByRole("button", { name: "Resolve" }))
    await user.type(within(panel).getByLabelText("Why this is resolved"), "The guidelines are newer")
    await user.click(within(panel).getByRole("button", { name: "Save" }))
    expect(actions.resolveIssue).toHaveBeenCalledWith("composite-colors", 0, "The guidelines are newer")
  })

  it("edits a rule and saves the changes", async () => {
    const { actions, user } = setup()
    const panel = await openRule(user, "Composite colors")
    await user.click(within(panel).getByRole("button", { name: "Edit" }))
    const title = within(panel).getByLabelText("Title")
    await user.clear(title)
    await user.type(title, "Composite fence colors")
    await user.selectOptions(within(panel).getByLabelText("Who decides"), "committee")
    await user.click(within(panel).getByRole("button", { name: "Save" }))
    expect(actions.save).toHaveBeenCalledWith(
      "composite-colors",
      expect.objectContaining({ title: "Composite fence colors", discretion: "committee", isCurable: true })
    )
  })

  it("deletes a rule after confirming", async () => {
    const { actions, user } = setup()
    const panel = await openRule(user, "Composite colors")
    await user.click(within(panel).getByRole("button", { name: "Delete" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
    expect(actions.remove).toHaveBeenCalledWith("composite-colors")
  })

  it("discards the draft after confirming", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Discard draft" }))
    await user.click(screen.getByRole("button", { name: "Discard" }))
    expect(props.onDiscardDraft).toHaveBeenCalled()
  })

  it("shows the published rulebook read-only and starts editing it", async () => {
    const { props, user } = setup({
      draft: { ...draft, rulebook: null, rules: [], removed: [], blockers: [], lastBuildError: "Section 5 failed." }
    })
    expect(screen.getByText("Section 5 failed.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit rules" })).toBeInTheDocument()
    const panel = await openRule(user, published.rules[0]!.title)
    expect(within(panel).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Edit rules" }))
    expect(props.onEditPublished).toHaveBeenCalled()
    expect(screen.getByText("No draft")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Edit published rules" }))
    expect(props.onEditPublished).toHaveBeenCalledTimes(2)
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

  it("opens a citation in its document, removes one, and adds one picked from the page", async () => {
    const twoCitations = {
      ...colors,
      citations: [...colors.citations, { ...colors.citations[0]!, quote: "Trex in Winchester Grey or Saddle." }]
    }
    const { actions, user } = setup({ draft: { ...draft, rules: [twoCitations, unverified] } })
    const panel = await openRule(user, "Composite colors")
    expect(within(panel).queryByRole("textbox", { name: /Quote/ })).not.toBeInTheDocument()

    await user.click(within(panel).getAllByRole("button", { name: "Remove" })[1]!)
    expect(actions.removeCitation).toHaveBeenCalledWith("composite-colors", 1)

    await user.click(within(panel).getAllByRole("button", { name: "View in document" })[0]!)
    const viewer = await screen.findByRole("dialog", { name: "Citation in the document" })
    expect(await within(viewer).findByText(/Fence colors are limited/)).toBeInTheDocument()
    expect(within(viewer).queryByRole("button", { name: "Add as citation" })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add citation" }))
    const picker = await screen.findByRole("dialog", { name: "Add a citation" })
    expect(within(picker).getByRole("button", { name: "Add as citation" })).toBeDisabled()
    await user.keyboard("{Escape}")

    await user.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Edit citation" })[0]!)
    const editor = await screen.findByRole("dialog", { name: "Edit the citation" })
    expect(within(editor).getByRole("button", { name: "Use this passage" })).toBeDisabled()
  })

  it("lets the last citation go, then asks for one before saving or approving", async () => {
    const uncited = { ...colors, citations: [] }
    const { actions, user } = setup({ draft: { ...draft, rules: [uncited, unverified] } })
    const panel = await openRule(user, "Composite colors")
    expect(within(panel).getByRole("alert")).toHaveTextContent("No citation.")
    expect(within(panel).getByRole("button", { name: "Approve" })).toBeDisabled()
    await user.click(within(panel).getByRole("button", { name: "Edit" }))
    expect(within(panel).getByRole("button", { name: "Save" })).toBeDisabled()
    await user.click(within(panel).getByRole("button", { name: "Cancel" }))

    await user.keyboard("{Escape}")
    const single = await openRule(user, "Posts match")
    await user.click(within(single).getByRole("button", { name: "Remove" }))
    expect(actions.removeCitation).toHaveBeenCalledWith("posts", 0)
  })
})
