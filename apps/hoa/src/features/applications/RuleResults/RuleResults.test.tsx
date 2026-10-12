import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Finding } from "@/schema/types"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext } from "../reviewContext"
import { RuleResults } from "./RuleResults"

const colors = "Composite colors by manufacturer"

function setup() {
  const fence = fenceReview()
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  const onOpen = vi.fn<(finding: Finding) => void>()
  const context = createReviewContext({
    review: fence.review,
    rules: fence.rules,
    terms: fence.terms,
    files: fence.files,
    audience: "homeowner",
    entityEvidence: [{ entity: "gate-1", evidence: [{ fileId: "file-photo", page: 1, quote: null, region: null }] }],
    loadImage
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RuleResults context={context} onOpen={onOpen} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), loadImage, onOpen }
}

describe("RuleResults", () => {
  it("lists each check that applies: the rule by its linked name, the part it read, and the result", () => {
    setup()
    const table = within(screen.getByRole("table", { name: "How each rule was checked" }))
    expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Rule",
      "Part of the project",
      "Result"
    ])
    expect(table.getAllByRole("link", { name: colors }).length).toBeGreaterThan(1)
    expect(table.getByRole("button", { name: `${colors}, Left side run: Not met` })).toBeInTheDocument()
    expect(table.queryByText("n/a")).not.toBeInTheDocument()
  })

  it("filters to chosen results", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: /^Committee \d+$/ }))
    const table = within(screen.getByRole("table", { name: "How each rule was checked" }))
    expect(table.queryByRole("link", { name: colors })).not.toBeInTheDocument()
    expect(table.getAllByRole("button", { name: /: Committee$/ }).length).toBeGreaterThan(0)
  })

  it("opens a result's finding", async () => {
    const { user, onOpen } = setup()
    await user.click(screen.getByRole("button", { name: `${colors}, Left side run: Not met` }))
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: "guidelines:5.4.2(i)#colors", entity: "run-1", outcome: "not-met" })
    )
  })

  it("says what identified a part, with the photo that named it", async () => {
    const { user, loadImage } = setup()
    await user.click(screen.getAllByRole("button", { name: "Gate on the return run: what was identified" })[0]!)
    expect(await screen.findByText("Identified from")).toBeInTheDocument()
    expect(await screen.findByRole("img", { name: "new-fence.jpg" })).toBeInTheDocument()
    expect(loadImage).toHaveBeenCalledWith("file-photo")
  })

  it("keeps the rules that apply to nothing in the project apart, on demand", async () => {
    const { user } = setup()
    expect(screen.queryByRole("list", { name: "Rules that don’t apply" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /apply to this project$/ }))
    expect(within(screen.getByRole("list", { name: "Rules that don’t apply" })).getAllByRole("listitem").length).toBe(
      Number(/^\d+/.exec(screen.getByRole("button", { name: /apply to this project$/ }).textContent ?? "")?.[0])
    )
  })
})
