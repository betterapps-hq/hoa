import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { fenceRules, review } from "@/tests/fixtures"
import type { ReviewProjectResult } from "../review.functions"
import { SubmitProjectPage } from "./SubmitProjectPage"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>
}))

const packet = new File(["%PDF"], "application.pdf", { type: "application/pdf" })

async function submit(result: ReviewProjectResult | (() => Promise<ReviewProjectResult>)) {
  const onSubmit = vi.fn<(formData: FormData) => Promise<ReviewProjectResult>>(async () =>
    typeof result === "function" ? result() : result
  )
  render(<SubmitProjectPage hoaName="Sample Ridge HOA" onSubmit={onSubmit} />)
  await userEvent.type(screen.getByLabelText("Description (optional)"), "Replace the rear fence")
  await userEvent.upload(screen.getByLabelText("Application files"), packet)
  await userEvent.click(screen.getByRole("button", { name: "Submit for review" }))
  return onSubmit
}

describe("SubmitProjectPage", () => {
  it("asks the HOA to publish its rulebook first", () => {
    render(
      <SubmitProjectPage hoaName={undefined} onSubmit={vi.fn<(formData: FormData) => Promise<ReviewProjectResult>>()} />
    )
    expect(screen.getByRole("status")).toHaveTextContent("hasn't published its rulebook yet")
    expect(screen.getByRole("link", { name: "upload and approve the rules" })).toHaveAttribute("href", "/rules")
  })

  it("sends the project type, description and files, then shows the review", async () => {
    const onSubmit = await submit({
      status: "succeeded",
      hoaName: "Sample Ridge HOA",
      review,
      rules: fenceRules,
      costUsd: 0.01,
      latencyMs: 30000,
      traceId: undefined
    })

    const formData = onSubmit.mock.calls[0]![0]
    expect(formData.get("projectType")).toBe("fence")
    expect(formData.get("description")).toBe("Replace the rear fence")
    expect(formData.getAll("files")).toEqual([packet])
    expect(await screen.findByRole("heading", { level: 2, name: "Request more information" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Submit another project" }))
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeInTheDocument()
  })

  it("lists the only project type, Fence", () => {
    render(
      <SubmitProjectPage
        hoaName="Sample Ridge HOA"
        onSubmit={vi.fn<(formData: FormData) => Promise<ReviewProjectResult>>()}
      />
    )
    expect(screen.getByRole("combobox", { name: "Project type" })).toHaveDisplayValue("Fence")
    expect(screen.getAllByRole("option")).toHaveLength(1)
  })

  const failures: [ReviewProjectResult, string][] = [
    [{ status: "failed", message: "Model unavailable" }, "The project couldn't be reviewed: Model unavailable"],
    [{ status: "no-rulebook" }, "The rulebook has no rules for this project type yet."],
    [{ status: "not-configured", missing: ["OPENROUTER_API_KEY"] }, "Add OPENROUTER_API_KEY to apps/hoa/.env"]
  ]

  it.each(failures)("reports %o", async (result, message) => {
    await submit(result)
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
  })

  it("shows a request that couldn't reach the server on the form", async () => {
    await submit(async () => Promise.reject(new Error("Network error")))
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error")
    expect(screen.getByText("application.pdf")).toBeInTheDocument()
  })

  it("removes a selected file", async () => {
    render(
      <SubmitProjectPage
        hoaName="Sample Ridge HOA"
        onSubmit={vi.fn<(formData: FormData) => Promise<ReviewProjectResult>>()}
      />
    )
    await userEvent.upload(screen.getByLabelText("Application files"), packet)
    await userEvent.click(screen.getByRole("button", { name: "Remove application.pdf" }))

    expect(screen.queryByText("application.pdf")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled()
  })
})
