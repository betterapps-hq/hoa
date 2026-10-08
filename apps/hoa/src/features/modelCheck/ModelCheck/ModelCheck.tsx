import { Loader2Icon } from "lucide-react"
import { useState } from "react"
import { match } from "ts-pattern"
import { Notice } from "@/components/Notice"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ModelCheckResult } from "../modelCheckResult"
import { formatCost, formatTokens } from "./ModelCheck.utils"

export type ModelCheckProps = {
  onRun: () => Promise<ModelCheckResult>
}

type CheckState = { status: "idle" } | { status: "running" } | ModelCheckResult

export function ModelCheck({ onRun }: ModelCheckProps) {
  const [state, setState] = useState<CheckState>({ status: "idle" })

  async function handleRun() {
    setState({ status: "running" })
    try {
      setState(await onRun())
    } catch (error) {
      setState({ status: "failed", message: error instanceof Error ? error.message : "The model check failed." })
    }
  }

  return (
    <section aria-labelledby="model-check-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="model-check-heading">Model check</h2>
          </CardTitle>
          <CardDescription>
            Send a short prompt to the configured model to confirm OpenRouter, prompt management and tracing are
            connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="self-start" onClick={handleRun} disabled={state.status === "running"}>
            {state.status === "running" && <Loader2Icon className="animate-spin" />}
            {state.status === "running" ? "Checking the model" : "Run model check"}
          </Button>
          <div aria-live="polite">
            {match(state)
              .with({ status: "idle" }, { status: "running" }, () => null)
              .with({ status: "not-configured" }, ({ missing }) => (
                <Notice tone="danger">
                  Add {missing.join(" and ")} to <code>apps/hoa/.env</code>, then restart the dev server.
                </Notice>
              ))
              .with({ status: "failed" }, ({ message }) => (
                <Notice tone="danger">The model check didn’t complete: {message}</Notice>
              ))
              .with({ status: "succeeded" }, (result) => (
                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm [&>dd]:min-w-0 [&>dd]:break-words [&>dt]:text-muted-foreground">
                  <dt>Response</dt>
                  <dd>{result.text}</dd>
                  <dt>Model</dt>
                  <dd>{result.modelId}</dd>
                  <dt>Prompt</dt>
                  <dd>
                    {result.promptName} version {result.promptVersion}
                  </dd>
                  <dt>Latency</dt>
                  <dd>{result.latencyMs.toLocaleString("en-US")} ms</dd>
                  <dt>Tokens</dt>
                  <dd>{formatTokens(result.inputTokens, result.outputTokens)}</dd>
                  <dt>Cost</dt>
                  <dd>{formatCost(result.costUsd)}</dd>
                  <dt>Langfuse trace</dt>
                  <dd className={result.traceId ? "font-mono break-all" : undefined}>
                    {result.traceId ?? "Not recorded"}
                  </dd>
                </dl>
              ))
              .exhaustive()}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
