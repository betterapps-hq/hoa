import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { BuildResult } from "@/rulebook/buildResults"
import type { BuildResults } from "@/rulebook/buildResults.server"
import { BuildFeed } from "./BuildFeed"
import { resultSentence } from "./BuildFeed.utils"

const documents = [{ key: "declaration", title: "Declaration for Maple Hollow", documentId: "upload-1" }]
const at = (minute: number) => new Date(Date.UTC(2026, 9, 9, 12, minute)).toISOString()

const results: BuildResult[] = [
  {
    id: "defined-terms:declaration",
    at: at(1),
    kind: "terms",
    documentKey: "declaration",
    labels: ["Lot", "Owner", "Common Area"]
  },
  {
    id: "find-rules:declaration:article-3",
    at: at(5),
    kind: "outlines",
    unitId: "declaration:article-3",
    rules: [{ key: "declaration:3.1#no-pets", title: "No pets on a lot", provisionKey: "declaration:3.1" }],
    isRerun: false
  },
  { id: "find-rules:check", at: at(6), kind: "checked-together", unitsWithProblems: 1, problems: 2 },
  {
    id: "structure-rules:declaration:3.1#no-pets",
    at: at(8),
    kind: "rules",
    batchId: "declaration:3.1#no-pets",
    rules: [{ key: "declaration:3.1#no-pets", title: "No pets", provisionKey: "declaration:3.1" }],
    round: 0
  },
  { id: "consolidate:result", at: at(30), kind: "consolidated", problems: 0, conflicts: 2 }
]

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe("BuildFeed", () => {
  it("shows the latest results newest first, with links to the cited provisions, and the rest on request", async () => {
    const loadResults = vi.fn<(since: string | null) => Promise<BuildResults>>(async () => ({
      results,
      cursor: at(30),
      documents
    }))
    render(<BuildFeed jobId="job-1" loadResults={loadResults} isRunning={false} />, { wrapper })
    const list = await screen.findByRole("list", { name: "Found so far" })
    const newest = within(list)
      .getAllByRole("listitem")
      .find((item) => item.parentElement === list)
    expect(newest).toHaveTextContent("Checked the whole draft for duplicates and conflicts: 2 conflicts to decide")
    expect(screen.queryByText("Found 3 defined terms in Declaration for Maple Hollow")).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Declaration 3.1" })[0]).toHaveAttribute(
      "href",
      "/documents/upload-1?provision=declaration%3A3.1"
    )
    await userEvent.setup().click(screen.getByRole("button", { name: "Show all 5" }))
    expect(screen.getByText("Found 3 defined terms in Declaration for Maple Hollow")).toBeInTheDocument()
    expect(screen.getByText("Lot, Owner, Common Area")).toBeInTheDocument()
    expect(loadResults).toHaveBeenCalledWith(null)
  })

  it("shows nothing until the build has a result", async () => {
    const loadResults = vi.fn<(since: string | null) => Promise<BuildResults>>(async () => ({
      results: [],
      cursor: null,
      documents
    }))
    const { container } = render(<BuildFeed jobId="job-2" loadResults={loadResults} isRunning={false} />, { wrapper })
    await vi.waitFor(() => expect(loadResults).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe("resultSentence", () => {
  it("says what each step produced in plain words", () => {
    expect(results.map((result) => resultSentence(result, documents))).toEqual([
      "Found 3 defined terms in Declaration for Maple Hollow",
      "Found 1 rule in Declaration Article 3",
      "Checked every section’s rules together: 2 problems in 1 section to look at again",
      "Drafted 1 rule from Declaration 3.1",
      "Checked the whole draft for duplicates and conflicts: 2 conflicts to decide in the review"
    ])
    const more: BuildResult[] = [
      { id: "a", at: at(1), kind: "outlines", unitId: "rules:1", rules: [], isRerun: true },
      { id: "b", at: at(1), kind: "vocabulary", unitId: "declaration:article-3", labels: ["Height", "Fence"] },
      {
        id: "c",
        at: at(1),
        kind: "rules",
        batchId: "declaration:3.1#no-pets",
        rules: [{ key: "declaration:3.1#no-pets", title: "No pets", provisionKey: "declaration:3.1" }],
        round: 1
      },
      { id: "d", at: at(1), kind: "rules-checked", round: 1, rulesWithProblems: 0 }
    ]
    expect(more.map((result) => resultSentence(result, documents))).toEqual([
      "Looked at Rules 1 again: no rules",
      "Built the vocabulary for the rules from Declaration Article 3: 2 terms",
      "Redrafted 1 rule from Declaration 3.1 that had problems",
      "Checked the drafted rules together: no problems"
    ])
  })
})
