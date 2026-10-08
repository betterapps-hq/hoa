import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { ModelCheckResult } from "../modelCheckResult"
import { ModelCheck } from "./ModelCheck"
import { formatCost, formatTokens } from "./ModelCheck.utils"

const succeeded: ModelCheckResult = {
  status: "succeeded",
  modelId: "anthropic/claude-haiku-5.5",
  isLangfuseConfigured: true,
  text: "Ready to review architectural applications.",
  promptName: "hoa-model-check",
  promptVersion: 2,
  inputTokens: 1200,
  outputTokens: 9,
  costUsd: 0.00253,
  latencyMs: 1834,
  traceId: "0af7651916cd43dd8448eb211c80319c",
  isCached: false
}

async function runCheck(result: ModelCheckResult | (() => Promise<ModelCheckResult>)) {
  const onRun = typeof result === "function" ? result : async () => result
  render(<ModelCheck onRun={onRun} />)
  await userEvent.click(screen.getByRole("button", { name: "Run model check" }))
}

describe("ModelCheck", () => {
  it("shows the response with its prompt version, latency, tokens, cost and trace", async () => {
    await runCheck(succeeded)

    expect(await screen.findByText("Ready to review architectural applications.")).toBeInTheDocument()
    expect(screen.getByText("hoa-model-check version 2")).toBeInTheDocument()
    expect(screen.getByText("1,834 ms")).toBeInTheDocument()
    expect(screen.getByText("1,200 in, 9 out")).toBeInTheDocument()
    expect(screen.getByText("$0.00253")).toBeInTheDocument()
    expect(screen.getByText("0af7651916cd43dd8448eb211c80319c")).toBeInTheDocument()
  })

  it("flags a fallback prompt and missing Langfuse tracing", async () => {
    await runCheck({ ...succeeded, promptVersion: "fallback", traceId: undefined, isLangfuseConfigured: false })

    expect(await screen.findByText("hoa-model-check (local fallback, not linked to Langfuse)")).toBeInTheDocument()
    expect(screen.getByText("Langfuse isn't configured")).toBeInTheDocument()
  })

  it("lists the settings to add when OpenRouter isn't configured", async () => {
    await runCheck({ status: "not-configured", missing: ["OPENROUTER_API_KEY"] })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add OPENROUTER_API_KEY to apps/hoa/.env, then restart the dev server."
    )
  })

  it("reports a failed check", async () => {
    await runCheck({ status: "failed", message: "No endpoints found." })

    expect(await screen.findByRole("alert")).toHaveTextContent("The model check didn’t complete: No endpoints found.")
  })

  it("reports a request that couldn't reach the server", async () => {
    await runCheck(async () => {
      throw new Error("Network error")
    })

    expect(await screen.findByRole("alert")).toHaveTextContent("The model check didn’t complete: Network error")
  })
})

describe("ModelCheck.utils", () => {
  it("formats missing usage and cost as not reported", () => {
    expect(formatCost(undefined)).toBe("Not reported")
    expect(formatTokens(undefined, undefined)).toBe("Not reported")
    expect(formatTokens(10, undefined)).toBe("10 in, 0 out")
  })
})
