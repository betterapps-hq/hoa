import { LangfuseSpanProcessor } from "@langfuse/otel"
import { context, trace } from "@opentelemetry/api"
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createPromptLoader } from "./promptLoader"
import type { PromptLoader } from "./promptLoader"
import { prompts } from "./prompts"
import { runObjectPrompt, runTextPrompt } from "./runPrompt"
import { registerTracerProvider } from "./telemetry.server"

function createModel(
  providerMetadata?: Record<string, Record<string, number | Record<string, number>>>,
  text = "Ready to review."
) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 42, noCache: 42, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 }
      },
      warnings: [],
      ...(providerMetadata ? { providerMetadata } : {})
    }
  })
}

const langfusePrompt: PromptLoader = async (prompt) => ({
  name: prompt.name,
  version: 3,
  config: {},
  compile: (variables) => `Managed prompt for ${variables?.applicant ?? "nobody"}`
})

describe("runTextPrompt", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
  })

  it("compiles the prompt, calls the model and reports usage and OpenRouter's billed cost", async () => {
    const model = createModel({ openrouter: { usage: { cost: 0.000123 } } })

    const result = await runTextPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: prompts.modelCheck,
      variables: { applicant: "Lot 12" },
      traceName: "model-check",
      environment: "test",
      sessionId: "session-1"
    })

    expect(model.doGenerateCalls[0]?.prompt).toEqual([
      { role: "user", content: [{ type: "text", text: "Managed prompt for Lot 12" }] }
    ])
    expect(result).toMatchObject({
      text: "Ready to review.",
      promptName: "hoa-model-check",
      promptVersion: 3,
      inputTokens: 42,
      outputTokens: 5,
      costUsd: 0.000123
    })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("sends no trace to OpenRouter when tracing is off", async () => {
    const model = createModel()

    const result = await runTextPrompt({
      loadPrompt: createPromptLoader(undefined, "production"),
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: prompts.modelCheck,
      traceName: "model-check",
      environment: "test",
      sessionId: "session-1"
    })

    expect(model.doGenerateCalls[0]?.providerOptions).toEqual({ openrouter: { session_id: "session-1" } })
    expect(result.traceId).toBeUndefined()
    expect(result.promptVersion).toBe("fallback")
    expect(result.costUsd).toBeUndefined()
  })

  it("nests OpenRouter's Broadcast generation under the app's Langfuse span", async () => {
    // The real Langfuse processor, exporting to memory, so the test sees exactly what Langfuse would receive.
    const ended: { name: string; traceId: string; spanId: string; attributes: Record<string, unknown> }[] = []
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new LangfuseSpanProcessor({
          publicKey: "pk-lf-test",
          secretKey: "sk-lf-test",
          exportMode: "immediate",
          exporter: {
            export: (spans, done) => {
              for (const span of spans) {
                ended.push({
                  name: span.name,
                  traceId: span.spanContext().traceId,
                  spanId: span.spanContext().spanId,
                  attributes: span.attributes
                })
              }
              done({ code: 0 })
            },
            shutdown: async () => undefined
          }
        })
      ]
    })
    registerTracerProvider(provider)
    const model = createModel()

    const result = await runTextPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: prompts.modelCheck,
      traceName: "model-check",
      environment: "test",
      sessionId: "session-1"
    })
    await provider.forceFlush()

    const span = ended.find((entry) => entry.name === "model-check")
    expect(span).toBeDefined()
    expect(span?.attributes).toMatchObject({ "langfuse.trace.name": "model-check", "session.id": "session-1" })
    expect(result.traceId).toBe(span?.traceId)
    expect(model.doGenerateCalls[0]?.providerOptions).toEqual({
      openrouter: {
        session_id: "session-1",
        trace: {
          trace_id: span?.traceId,
          parent_span_id: span?.spanId,
          trace_name: "model-check",
          generation_name: "hoa-model-check",
          environment: "test",
          prompt_name: "hoa-model-check",
          prompt_version: "3"
        }
      }
    })
    await provider.shutdown()
  })
})

describe("runObjectPrompt", () => {
  it("sends attachments after the prompt and returns JSON validated against the schema", async () => {
    const model = createModel(undefined, JSON.stringify({ recommendation: "request-information", missing: ["Height"] }))
    const pdf = new Uint8Array([37, 80, 68, 70])

    const result = await runObjectPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: prompts.applicationReview,
      schema: z.object({ recommendation: z.string(), missing: z.array(z.string()) }),
      attachments: [
        { type: "file", filename: "application.pdf", mediaType: "application/pdf", data: pdf },
        { type: "text", text: "Text of appendix.docx: Trex fence" }
      ],
      traceName: "application-review",
      environment: "test"
    })

    expect(result.object).toEqual({ recommendation: "request-information", missing: ["Height"] })
    expect(model.doGenerateCalls[0]?.prompt).toMatchObject([
      {
        role: "user",
        content: [
          { type: "text", text: "Managed prompt for nobody" },
          { type: "file", filename: "application.pdf", mediaType: "application/pdf" },
          { type: "text", text: "Text of appendix.docx: Trex fence" }
        ]
      }
    ])
  })

  it("rejects output that doesn't match the schema", async () => {
    await expect(
      runObjectPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => createModel(undefined, JSON.stringify({ recommendation: 5 })),
        defaultModelId: "test-model",
        prompt: prompts.applicationReview,
        schema: z.object({ recommendation: z.string() }),
        traceName: "application-review",
        environment: "test"
      })
    ).rejects.toThrow("No object generated")
  })
})

describe("model and version selection", () => {
  it("uses the prompt version's model when it names one, and loads a pinned version", async () => {
    const model = createModel()
    const createModelFor = vi.fn<(modelId: string) => typeof model>(() => model)
    const loadPrompt = vi.fn<PromptLoader>(async (prompt) => ({
      name: prompt.name,
      version: 9,
      config: { model: "anthropic/claude-sonnet-5.5" },
      compile: () => "Pinned"
    }))

    const result = await runTextPrompt({
      loadPrompt,
      createModel: createModelFor,
      defaultModelId: "test-model",
      prompt: prompts.modelCheck,
      promptVersion: 9,
      traceName: "model-check",
      environment: "test"
    })

    expect(loadPrompt).toHaveBeenCalledWith(prompts.modelCheck, { version: 9 })
    expect(createModelFor).toHaveBeenCalledWith("anthropic/claude-sonnet-5.5")
    expect(result).toMatchObject({ modelId: "anthropic/claude-sonnet-5.5", promptVersion: 9 })
  })
})

describe("content cache", () => {
  it("answers a repeated call from the cache and misses when the input changes", async () => {
    const stored = new Map<string, unknown>()
    const cache = {
      get: async (key: string) => stored.get(key),
      put: async (key: string, value: unknown) => {
        stored.set(key, value)
      }
    }
    const model = createModel(undefined, JSON.stringify({ recommendation: "approve" }))
    const run = (applicant: string) =>
      runObjectPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => model,
        defaultModelId: "test-model",
        prompt: prompts.applicationReview,
        schema: z.object({ recommendation: z.string() }),
        variables: { applicant },
        attachments: [{ type: "text", text: "Packet" }],
        traceName: "application-review",
        environment: "test",
        cache
      })

    const first = await run("Lot 12")
    const second = await run("Lot 12")
    const third = await run("Lot 13")

    expect(first).toMatchObject({ isCached: false, object: { recommendation: "approve" } })
    expect(second).toMatchObject({ isCached: true, costUsd: 0, object: { recommendation: "approve" } })
    expect(third.isCached).toBe(false)
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(stored.size).toBe(2)
  })
})
