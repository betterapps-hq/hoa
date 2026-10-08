import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Rule, Rulebook } from "@/rules/rules"
import { fenceRules, rulebook } from "@/tests/fixtures"
import type { ExtractRulesResult } from "../rulebook.functions"
import { RulebookPage } from "./RulebookPage"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>
}))

const guidelines = new File(["%PDF"], "Design Guidelines.pdf", { type: "application/pdf" })

type PublishInput = { hoaName: string; documents: string[]; rules: Rule[] }

function renderPage(
  extracted: ExtractRulesResult | (() => Promise<ExtractRulesResult>),
  current: Rulebook | null = null
) {
  const onExtract = vi.fn<(formData: FormData) => Promise<ExtractRulesResult>>(async () =>
    typeof extracted === "function" ? extracted() : extracted
  )
  const onPublish = vi.fn<(input: PublishInput) => Promise<Rulebook>>(async (input) => ({
    ...input,
    publishedAt: "2026-10-08T12:00:00.000Z"
  }))
  render(<RulebookPage rulebook={current} onExtract={onExtract} onPublish={onPublish} />)
  return { onExtract, onPublish }
}

async function extract() {
  await userEvent.type(screen.getByLabelText("HOA name"), "Sample Ridge HOA")
  await userEvent.upload(screen.getByLabelText("Documents"), guidelines)
  await userEvent.click(screen.getByRole("button", { name: "Extract rules" }))
}

describe("RulebookPage", () => {
  it("extracts rules from the uploaded documents, then publishes the approved ones", async () => {
    const { onExtract, onPublish } = renderPage({
      status: "succeeded",
      hoaName: "Sample Ridge HOA",
      documents: ["Design Guidelines.pdf"],
      rules: fenceRules,
      costUsd: 0.2,
      latencyMs: 90000,
      traceId: undefined
    })
    await extract()

    const formData = onExtract.mock.calls[0]![0]
    expect(formData.get("hoaName")).toBe("Sample Ridge HOA")
    expect(formData.getAll("documents")).toEqual([guidelines])
    expect(await screen.findByText(/3 rules found in Design Guidelines.pdf/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Approve remaining rules" }))
    await userEvent.click(screen.getByRole("button", { name: "Publish 3 approved rules" }))

    expect(onPublish).toHaveBeenCalledWith({
      hoaName: "Sample Ridge HOA",
      documents: ["Design Guidelines.pdf"],
      rules: fenceRules
    })
    expect(await screen.findByRole("status")).toHaveTextContent("The rulebook is published.")
    expect(screen.getByRole("heading", { name: "Sample Ridge HOA rulebook" })).toBeInTheDocument()
  })

  it("shows the published rulebook and lets the rep replace it", async () => {
    renderPage({ status: "failed", message: "unused" }, rulebook)

    expect(screen.getByText(/3 rules, published October 7, 2026 from CC&Rs.pdf, Design Guidelines.pdf/)).toBeVisible()
    expect(screen.getByText("Design Guidelines.pdf, 5.4.2, page 17")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Replace the rulebook" }))
    expect(screen.getByLabelText("HOA name")).toHaveValue("Sample Ridge HOA")
  })

  const failures: [ExtractRulesResult, string][] = [
    [{ status: "failed", message: "The PDF is password protected." }, "The PDF is password protected."],
    [{ status: "not-configured", missing: ["OPENROUTER_API_KEY"] }, "Add OPENROUTER_API_KEY to apps/hoa/.env"]
  ]

  it.each(failures)("reports %o on the upload form", async (result, message) => {
    renderPage(result)
    await extract()
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(screen.getByRole("button", { name: "Extract rules" })).toBeEnabled()
  })

  it("reports a request that couldn't reach the server", async () => {
    renderPage(async () => Promise.reject(new Error("Network error")))
    await extract()
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error")
  })
})
