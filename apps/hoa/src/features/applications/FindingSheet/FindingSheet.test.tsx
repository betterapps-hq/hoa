import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ActionItem, Review } from "@/review/reviewModel"
import type { Finding } from "@/schema/types"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, type ReviewAudience } from "../reviewContext"
import { FindingSheet } from "./FindingSheet"

const fee = "declaration:4.2(d)#fee-before-review"
const response = "declaration:4.3(b)/p3#written-response"
const signatures = "guidelines:3.1.5#owner-signatures"
const colors = "guidelines:5.4.2(i)#colors"
const gateBoards = "guidelines:5.9.1#gate-boards"
const harmony = "declaration:4.3(b)/p2#harmony"

type Options = {
  audience?: ReviewAudience
  onShowActionItem?: (item: ActionItem) => void
  changeFinding?: (finding: Finding) => Finding
  changeReview?: (review: Review) => Review
}

function setup(ruleKey: string, entity: string, options: Options = {}) {
  const { audience = "homeowner", changeFinding = (f) => f, changeReview = (r) => r, onShowActionItem } = options
  const fence = fenceReview()
  const review = changeReview(fence.review)
  const found = review.findings.find((item) => item.ruleKey === ruleKey && item.entity === entity)
  if (!found) {
    throw new Error(`No finding for ${ruleKey} on ${entity}`)
  }
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  const context = createReviewContext({
    review,
    rules: fence.rules,
    terms: fence.terms,
    files: fence.files,
    audience,
    entityEvidence: [],
    loadImage
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FindingSheet
        context={context}
        finding={changeFinding(found)}
        open
        onOpenChange={() => undefined}
        onShowActionItem={onShowActionItem}
      />
    </QueryClientProvider>
  )
  return {
    sheet: within(screen.getByRole("dialog")),
    title: fence.rules.find((rule) => rule.key === ruleKey)?.title,
    loadImage
  }
}

/** The card for one fact the finding read, by its text. */
function input(sheet: ReturnType<typeof within>, text: RegExp) {
  const item = within(sheet.getByRole("region", { name: "What it read" }))
    .getAllByRole("listitem")
    .find((found) => text.test(found.textContent ?? ""))
  if (!item) {
    throw new Error(`No input matching ${text}`)
  }
  return within(item)
}

describe("FindingSheet", () => {
  it("names the rule and the entity, with the outcome, the provision's text and why", async () => {
    const { sheet, title } = setup(colors, "run-1")
    // The title takes focus, so the rule's preview doesn't open over the sheet.
    await vi.waitFor(() => expect(sheet.getByRole("heading", { name: title })).toHaveFocus())
    expect(sheet.getByText("Left side run")).toBeInTheDocument()
    expect(sheet.getAllByText("Not met").length).toBeGreaterThan(0)
    expect(
      within(sheet.getByRole("region", { name: "The rule" })).getByRole("button", { name: /^View in document/ })
    ).toBeInTheDocument()
    expect(sheet.getByRole("region", { name: "Why" })).toHaveTextContent(/\w/)
  })

  it("marks facts the portal recorded, and facts the packet doesn't give", () => {
    const { sheet } = setup(fee, "request")
    expect(input(sheet, /^Review fee(?! paid)/i).getByText("From the application record")).toBeInTheDocument()
    const paidOn = input(sheet, /paid/i)
    expect(paidOn.getByText("Not provided")).toBeInTheDocument()
    expect(paidOn.getByText("The packet doesn’t say.")).toBeInTheDocument()
  })

  it("marks facts worked out from others as computed", () => {
    const { sheet } = setup(response, "request", { audience: "committee" })
    const read = within(sheet.getByRole("region", { name: "What it read" }))
    expect(read.getByText("Computed")).toBeInTheDocument()
    expect(read.getByText("Worked out from other facts.")).toBeInTheDocument()
  })

  it("gives a fact read from the packet with its confidence and quote, worded for the reader", () => {
    const { sheet } = setup(colors, "run-1", { audience: "committee" })
    const color = input(sheet, /^Color/i)
    expect(color.getByText(/confidence 90%/)).toBeInTheDocument()
    expect(color.getByText("“Trex fence in River Birtch”")).toBeInTheDocument()
    expect(input(sheet, /^Material/i).getByText("Read from the packet")).toBeInTheDocument()
  })

  it("shows the photo a fact was read from as a thumbnail, without a page number", async () => {
    const { sheet, loadImage } = setup(gateBoards, "gate-1", {
      changeReview: (review) => ({
        ...review,
        request: {
          ...review.request,
          facts: review.request.facts.map((fact) =>
            fact.entity === "gate-1" && fact.property === "gate.board-orientation"
              ? { ...fact, confidence: 0.7, evidence: [{ fileId: "file-photo", page: 1, quote: null, region: null }] }
              : fact
          )
        }
      })
    })
    const boards = input(sheet, /new-fence\.jpg/)
    expect(await boards.findByRole("img", { name: "new-fence.jpg" })).toBeInTheDocument()
    expect(boards.getByText("new-fence.jpg")).toBeInTheDocument()
    expect(boards.getByText(/confidence 70%/)).toBeInTheDocument()
    expect(loadImage).toHaveBeenCalledWith("file-photo")
  })

  it("shows a document check's result: whether it's present, who signed, and where", () => {
    const { sheet } = setup(signatures, "request")
    const documents = within(sheet.getByRole("region", { name: "Documents" }))
    expect(documents.getByText(/in the packet, signed by The owner on the form and the appendix/)).toBeInTheDocument()
    expect(documents.getByText("application-form.pdf, page 1")).toBeInTheDocument()
  })

  it("shows each statement a document must make as confirmed, contradicted or not found, with its quote", () => {
    const { sheet } = setup(signatures, "request", {
      changeFinding: (finding) => ({
        ...finding,
        statements: [
          { statement: "Says before photos are attached", confirmed: false, quote: "Before photos: No" },
          { statement: "Says the neighbors signed", confirmed: null, quote: null },
          { statement: "Names the project", confirmed: true, quote: "Fence replacement" }
        ]
      })
    })
    const documents = within(sheet.getByRole("region", { name: "Documents" }))
    expect(documents.getByText("Contradicted")).toBeInTheDocument()
    expect(documents.getByText("Not found")).toBeInTheDocument()
    expect(documents.getByText("Confirmed")).toBeInTheDocument()
    expect(documents.getByText("“Before photos: No”")).toBeInTheDocument()
  })

  it("links to the next step that covers the finding, worded for the reader", async () => {
    const onShowActionItem = vi.fn<(item: ActionItem) => void>()
    const { sheet } = setup(colors, "run-1", { onShowActionItem })
    await userEvent.setup().click(sheet.getByRole("button", { name: /^Change in your plans: / }))
    expect(onShowActionItem).toHaveBeenCalledWith(expect.objectContaining({ ruleKey: colors }))
  })

  it("doesn't link to a next step that isn't on the page", () => {
    const { sheet } = setup(colors, "run-1")
    expect(sheet.queryByRole("button", { name: /^Change in your plans: / })).not.toBeInTheDocument()
  })

  it("shows the committee the rules that changed a finding and the judgment's rationale", () => {
    const { sheet } = setup(harmony, "work-1", {
      audience: "committee",
      changeFinding: (finding) => ({
        ...finding,
        modifiedBy: [{ ruleKey: "declaration:4.1/p1#approval-required", effect: "decided-by" }]
      })
    })
    const modifiers = within(sheet.getByRole("region", { name: "Rules that changed this finding" }))
    expect(modifiers.getByText("Left to the committee by")).toBeInTheDocument()
    expect(modifiers.getByRole("button", { name: "Declaration 4.1, paragraph 1" })).toBeInTheDocument()
    const judgment = within(sheet.getByRole("region", { name: "Judgment" }))
    expect(judgment.getByText(/not enough of the neighboring homes/)).toBeInTheDocument()
    expect(judgment.getByText(/Unclear/)).toBeInTheDocument()
  })
})
