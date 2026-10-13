import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext, entityOf } from "../reviewContext"
import { EntityHeader } from "./EntityHeader"

function setup(entityId: string) {
  const { review, rules, terms, files } = fenceReview()
  const loadImage = vi.fn<(fileId: string) => Promise<string>>(async () => "data:image/png;base64,AA==")
  const context = createReviewContext({
    review,
    rules,
    terms,
    files,
    audience: "committee",
    entityEvidence: [
      {
        entity: "run-3",
        evidence: [{ fileId: "file-form", page: 2, quote: "rear property line along open space", region: null }]
      }
    ],
    loadImage
  })
  const entity = entityOf(context, entityId)
  if (!entity) {
    throw new Error(`No entity ${entityId}`)
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntityHeader entity={entity} context={context} />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), entity }
}

describe("EntityHeader", () => {
  it("opens what identification found: the type, the label and the evidence that named it", async () => {
    const { user } = setup("run-3")
    await user.click(
      screen.getByRole("button", { name: "Rear run, along the permanent open space tract: what was identified" })
    )
    expect(await screen.findByText("Fence run")).toBeInTheDocument()
    expect(screen.getByText("Identified from")).toBeInTheDocument()
    expect(screen.getByTitle("application-form.pdf").parentElement).toHaveTextContent("application-form.pdf, page 2")
    expect(screen.getByText("“rear property line along open space”")).toBeInTheDocument()
  })

  it("opens from the keyboard and says the application's own entities need no identifying", async () => {
    const { user } = setup("request")
    await user.tab()
    await user.keyboard("{Enter}")
    expect(await screen.findByText("Every application has one.")).toBeInTheDocument()
  })

  it("says when the review kept nothing about what identified an entity", async () => {
    const { user } = setup("gate-1")
    await user.click(screen.getByRole("button", { name: "Gate on the return run: what was identified" }))
    expect(await screen.findByText("The review didn’t keep what identified it.")).toBeInTheDocument()
  })
})
