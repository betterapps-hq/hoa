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
    id: "vocabulary:upload-1",
    at: at(1),
    kind: "terms",
    documentId: "upload-1",
    labels: ["Lot", "Owner", "Common Area"],
    isReused: false
  },
  {
    id: "encode:declaration:article-3",
    at: at(5),
    kind: "rules",
    unitId: "declaration:article-3",
    rules: [{ key: "declaration:3.1#no-pets", title: "No pets", provisionKey: "declaration:3.1" }],
    isValid: true
  },
  { id: "verify:declaration:article-3", at: at(6), kind: "checked", unitId: "declaration:article-3", problems: 2 },
  {
    id: "repair:declaration:article-3:1",
    at: at(8),
    kind: "repaired",
    unitId: "declaration:article-3",
    round: 1,
    problemsLeft: 0
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
    expect(screen.getByRole("link", { name: "Declaration 3.1" })).toHaveAttribute(
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
      "Drafted 1 rule from Declaration Article 3",
      "Checked Declaration Article 3: 2 problems to fix",
      "Fixed the problems in Declaration Article 3",
      "Checked the whole draft for duplicates and conflicts: 2 conflicts to decide in the review"
    ])
    expect(
      resultSentence({ id: "r", at: at(1), kind: "repaired", unitId: "rules:1", round: 2, problemsLeft: null }, [])
    ).toBe("A fix for Rules 1 didn’t help, so its draft stays as it was")
  })
})
