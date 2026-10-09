import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Review } from "@/review/reviewModel"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { ReviewMatrix } from "./ReviewMatrix"

const colors = "Composite colors by manufacturer"

const harmony = "declaration:4.3(b)/p2#harmony"

function setup(audience: ReviewAudience = "homeowner", change: (review: Review) => Review = (review) => review) {
  const fence = fenceReview()
  const { rules, terms, files } = fence
  const review = change(fence.review)
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  const context = createReviewContext({
    review,
    rules,
    terms,
    files,
    audience,
    entityEvidence: [{ entity: "gate-1", evidence: [{ fileId: "file-photo", page: 1, quote: null, region: null }] }],
    loadImage
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewMatrix context={context} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), loadImage, review }
}

const rowOf = (name: string) => {
  const row = screen.getAllByRole("row").find((item) => within(item).queryByText(name, { selector: "span" }))
  if (!row) {
    throw new Error(`No row for ${name}`)
  }
  return row
}

describe("ReviewMatrix", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows every rule against each part of the project, with n/a where a rule doesn't apply", () => {
    setup()
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader")
    expect(headers.map((header) => header.textContent)).toEqual([
      "Rule",
      "Left side run",
      "Right side run",
      "Rear run, along the permanent open space tract",
      "Short run from the left side line to the garage's front corner",
      "Gate on the return run",
      "Replace the fence",
      "Fence application"
    ])
    const row = rowOf(colors)
    expect(within(row).getByRole("button", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: `${colors}, Left side run: Not met` })).toBeInTheDocument()
    expect(within(row).getAllByText("Doesn't apply")).toHaveLength(3)
    expect(screen.getByRole("rowheader", { name: "Guidelines 5.4.2(iii)" })).toBeInTheDocument()
  })

  it("filters to what needs attention and to chosen outcomes", async () => {
    const { user } = setup()
    expect(rowOf("Wood, composite or open metal fences only")).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Only what needs attention" }))
    expect(screen.queryByText("Wood, composite or open metal fences only")).not.toBeInTheDocument()
    expect(rowOf(colors)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Committee 2" }))
    expect(screen.queryByText(colors, { selector: "span" })).not.toBeInTheDocument()
    expect(rowOf("Work in harmony with its surroundings")).toBeInTheDocument()
  })

  it("opens a finding with its provision, reason and every fact it read, marked by where it came from", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: `${colors}, Left side run: Not met` }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByRole("heading", { name: colors })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: /^View in document/ })).toHaveTextContent(
      "View in document: Guidelines 5.4.2(i)"
    )
    const read = within(sheet).getByRole("region", { name: "What it read" })
    expect(within(read).getAllByText("Matched to a listed value")).toHaveLength(1)
    expect(within(read).getByText("“River Birtch” matched “River Birch”, 92% similar")).toBeInTheDocument()
    expect(within(read).getByText("“Trex fence in River Birtch”")).toBeInTheDocument()
    expect(within(read).getByText("appendix.docx, page 1")).toBeInTheDocument()
    expect(within(read).getAllByText("Read from your packet").length).toBeGreaterThan(0)
  })

  it("links the homeowner from a finding to its action item", async () => {
    const { user, review } = setup()
    const change = review.changes.find((found) => found.ruleKey === "guidelines:5.4.2(i)#colors")
    const item = document.createElement("li")
    item.id = `action-${change?.id}`
    item.tabIndex = -1
    document.body.appendChild(item)
    item.scrollIntoView = vi.fn<() => void>()
    await user.click(screen.getByRole("button", { name: `${colors}, Left side run: Not met` }))
    const sheet = await screen.findByRole("dialog")
    await user.click(within(sheet).getByRole("button", { name: /^What to change: / }))
    await vi.waitFor(() => expect(item).toHaveFocus())
    item.remove()
  })

  it("shows the committee the rules that changed a finding and the judgment's rationale", async () => {
    const { user } = setup("committee", (review) => ({
      ...review,
      findings: review.findings.map((finding) =>
        finding.ruleKey === harmony
          ? { ...finding, modifiedBy: [{ ruleKey: "declaration:4.1/p1#approval-required", effect: "decided-by" }] }
          : finding
      )
    }))
    await user.click(
      screen.getByRole("button", { name: "Work in harmony with its surroundings, Replace the fence: Committee" })
    )
    const sheet = await screen.findByRole("dialog")
    const modifiers = within(sheet).getByRole("region", { name: "Rules that changed this finding" })
    expect(within(modifiers).getByText("Left to the committee by")).toBeInTheDocument()
    expect(within(modifiers).getByRole("button", { name: "Declaration 4.1, paragraph 1" })).toBeInTheDocument()
    const judgment = within(sheet).getByRole("region", { name: "Judgment" })
    expect(within(judgment).getByText(/not enough of the neighboring homes/)).toBeInTheDocument()
    expect(within(judgment).getByText(/Unclear/)).toBeInTheDocument()
    expect(within(sheet).queryByRole("button", { name: /^For the committee: / })).not.toBeInTheDocument()
  })

  it("says what identified an entity, with the photo that named it", async () => {
    const { user, loadImage } = setup()
    await user.click(screen.getByRole("button", { name: "Gate on the return run: what was identified" }))
    expect(await screen.findByText("Identified from")).toBeInTheDocument()
    expect(await screen.findByRole("img", { name: "new-fence.jpg" })).toBeInTheDocument()
    expect(loadImage).toHaveBeenCalledWith("file-photo")
  })

  it("becomes one card per entity on a narrow screen", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 479px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }))
    setup()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    const cards = screen.getAllByRole("listitem").filter((item) => item.querySelector("ul"))
    expect(cards.length).toBeGreaterThan(5)
    expect(
      within(cards[0] ?? document.body).getByRole("button", { name: `${colors}, Left side run: Not met` })
    ).toBeInTheDocument()
  })
})
