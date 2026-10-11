import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Review } from "@/review/reviewModel"
import type { Finding } from "@/schema/types"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { ReviewMatrix } from "./ReviewMatrix"

const colors = "Composite colors by manufacturer"

function setup(audience: ReviewAudience = "homeowner", change: (review: Review) => Review = (review) => review) {
  const fence = fenceReview()
  const { rules, terms, files } = fence
  const review = change(fence.review)
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  const onOpen = vi.fn<(finding: Finding) => void>()
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
      <ReviewMatrix context={context} onOpen={onOpen} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), loadImage, onOpen }
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
    expect(within(row).getByRole("link", { name: "Guidelines 5.4.2(i)" })).toBeInTheDocument()
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
    await user.click(screen.getByRole("button", { name: "Committee 3" }))
    expect(screen.queryByText(colors, { selector: "span" })).not.toBeInTheDocument()
    expect(rowOf("Work in harmony with its surroundings")).toBeInTheDocument()
  })

  it("opens a cell's finding", async () => {
    const { user, onOpen } = setup()
    await user.click(screen.getByRole("button", { name: `${colors}, Left side run: Not met` }))
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: "guidelines:5.4.2(i)#colors", entity: "run-1", outcome: "not-met" })
    )
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
