import { LangfuseSpanProcessor } from "@langfuse/otel"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { context, trace } from "@opentelemetry/api"
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base"
import { APICallError } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ruleDraft } from "@/schema/zod"
import { replyingModel, replyStream } from "@/tests/scriptedModel"
import type { PromptLoader } from "./promptLoader"
import type { PromptDefinition } from "./prompts"
import {
  answerOf,
  defaultRetry,
  isRetryableCall,
  outputSchema,
  runCheckedObjectPrompt,
  runObjectPrompt,
  runTextPrompt,
  sharedPrefix
} from "./runPrompt"
import { registerTracerProvider } from "./telemetry.server"

const prompt = { name: "hoa-sample", variables: [] } as const satisfies PromptDefinition

function createModel(
  providerMetadata?: Record<string, Record<string, number | Record<string, number>>>,
  text = "Ready to review."
) {
  return replyingModel({ text, ...(providerMetadata ? { providerMetadata } : {}) })
}

/** A model that answers an object prompt by calling the respond tool. */
const objectModel = (input: unknown) => replyingModel({ toolInput: input })

/** A prompt whose calls fill in the applicant. */
const applicantPrompt = { name: "hoa-test-review", variables: ["applicant"] } as const

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
      prompt,
      variables: { applicant: "Lot 12" },
      traceName: "sample-stage",
      environment: "test",
      sessionId: "session-1"
    })

    expect(model.doStreamCalls[0]?.prompt).toEqual([
      { role: "user", content: [{ type: "text", text: "Managed prompt for Lot 12" }] }
    ])
    expect(result).toMatchObject({
      text: "Ready to review.",
      promptName: "hoa-sample",
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
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt,
      variables: {},
      traceName: "sample-stage",
      environment: "test",
      sessionId: "session-1"
    })

    expect(model.doStreamCalls[0]?.providerOptions).toEqual({ openrouter: { session_id: "session-1" } })
    expect(result.traceId).toBeUndefined()
    expect(result.promptVersion).toBe(3)
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
      prompt,
      variables: {},
      traceName: "sample-stage",
      environment: "test",
      sessionId: "session-1"
    })
    await provider.forceFlush()

    const span = ended.find((entry) => entry.name === "sample-stage")
    expect(span).toBeDefined()
    expect(span?.attributes).toMatchObject({ "langfuse.trace.name": "sample-stage", "session.id": "session-1" })
    expect(result.traceId).toBe(span?.traceId)
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      openrouter: {
        session_id: "session-1",
        trace: {
          trace_id: span?.traceId,
          parent_span_id: span?.spanId,
          trace_name: "sample-stage",
          generation_name: "hoa-sample",
          environment: "test",
          prompt_name: "hoa-sample",
          prompt_version: "3"
        }
      }
    })
    await provider.shutdown()
  })
})

describe("runObjectPrompt", () => {
  it("sends attachments after the prompt and returns JSON validated against the schema", async () => {
    const model = objectModel({ recommendation: "request-information", missing: ["Height"] })
    const pdf = new Uint8Array([37, 80, 68, 70])

    const result = await runObjectPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: applicantPrompt,
      variables: { applicant: "Lot 12" },
      schema: z.object({ recommendation: z.string(), missing: z.array(z.string()) }),
      attachments: [
        { type: "file", filename: "application.pdf", mediaType: "application/pdf", data: pdf },
        { type: "text", text: "Text of appendix.docx: Trex fence" }
      ],
      traceName: "application-review",
      environment: "test"
    })

    expect(result.object).toEqual({ recommendation: "request-information", missing: ["Height"] })
    expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: "auto" })
    expect(model.doStreamCalls[0]?.prompt).toMatchObject([
      {
        role: "user",
        content: [
          { type: "text", text: "Managed prompt for Lot 12" },
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
        createModel: () => objectModel({ recommendation: 5 }),
        defaultModelId: "test-model",
        prompt: applicantPrompt,
        variables: { applicant: "Lot 12" },
        schema: z.object({ recommendation: z.string() }),
        traceName: "application-review",
        environment: "test"
      })
    ).rejects.toThrow("No object generated")
  })
})

describe("runCheckedObjectPrompt", () => {
  const schema = z.object({
    rules: z.array(z.object({ title: z.string(), effectiveFrom: z.string() })),
    terms: z.array(z.object({ key: z.string(), organizationId: z.string() }))
  })
  const codeFields = {
    names: ["effectiveFrom", "organizationId"],
    fill: (answer: unknown) => {
      const records = z.array(z.record(z.string(), z.unknown())).default([])
      const parsed = z.object({ rules: records, terms: records })
      const result = parsed.safeParse(answer)
      return result.success
        ? {
            rules: result.data.rules.map((rule) => ({ ...rule, effectiveFrom: "2001-12-04" })),
            terms: result.data.terms.map((term) => ({ ...term, organizationId: "org-1" }))
          }
        : answer
    }
  }
  const run = (
    answer: unknown,
    cache?: { get: (key: string) => Promise<unknown>; put: (key: string, value: unknown) => Promise<void> }
  ) => {
    const model = objectModel(answer)
    return {
      model,
      result: runCheckedObjectPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => model,
        defaultModelId: "test-model",
        prompt: applicantPrompt,
        variables: { applicant: "Lot 12" },
        schema,
        codeFields,
        traceName: "rule-finding",
        environment: "test",
        ...(cache ? { cache } : {})
      })
    }
  }

  it("hides the fields code fills from the model and fills them before Zod checks the answer", async () => {
    const { model, result } = run({ rules: [{ title: "Pets" }], terms: [{ key: "pet" }] })
    expect(await result).toMatchObject({
      isValid: true,
      object: {
        rules: [{ title: "Pets", effectiveFrom: "2001-12-04" }],
        terms: [{ key: "pet", organizationId: "org-1" }]
      }
    })
    const sent = JSON.stringify(model.doStreamCalls[0]?.tools)
    expect(sent).toContain("title")
    expect(sent).not.toContain("effectiveFrom")
    expect(sent).not.toContain("organizationId")
  })

  it("parses a field the model sent as JSON text, then fills and checks the answer", async () => {
    const answer = { rules: JSON.stringify([{ title: "Pets" }]), terms: [{ key: "pet" }] }
    expect(await run(answer).result).toMatchObject({
      isValid: true,
      object: { rules: [{ title: "Pets", effectiveFrom: "2001-12-04" }], terms: [{ key: "pet" }] }
    })
    // A model that closes the answer's object inside the text too.
    const closed = { rules: [{ title: "Pets" }], terms: `${JSON.stringify([{ key: "pet", note: "a } in text" }])}}` }
    expect(await run(closed).result).toMatchObject({ isValid: true, object: { terms: [{ key: "pet" }] } })
    const text = await run({ rules: "Pets are allowed.", terms: [] }).result
    expect(text.isValid ? [] : text.issues.map((issue) => issue.path)).toEqual([["rules"]])
  })

  it("drops a key the schema doesn't know when its value is null, and keeps one with a value as an issue", async () => {
    const strict = z.strictObject({ outlines: z.array(z.strictObject({ kind: z.string() })) })
    const check = (answer: unknown) =>
      runCheckedObjectPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => objectModel(answer),
        defaultModelId: "test-model",
        prompt: applicantPrompt,
        variables: { applicant: "Lot 12" },
        schema: strict,
        traceName: "rule-finding",
        environment: "test"
      })
    expect(await check({ outlines: [{ kind: "obligation", kind_: null }] })).toMatchObject({
      isValid: true,
      object: { outlines: [{ kind: "obligation" }] }
    })
    expect(await check({ outlines: [{ kind: "obligation", kind_: "prohibition" }] })).toMatchObject({ isValid: false })
  })

  it("returns an answer that fails Zod with its issues, and caches it", async () => {
    const stored = new Map<string, unknown>()
    const cache = {
      get: async (key: string) => stored.get(key),
      put: async (key: string, value: unknown) => {
        stored.set(key, value)
      }
    }
    const first = await run({ rules: [{}], terms: [] }, cache).result
    expect(first).toMatchObject({ isValid: false, answer: { rules: [{ effectiveFrom: "2001-12-04" }], terms: [] } })
    expect(first.isValid ? [] : first.issues.map((issue) => issue.path)).toEqual([["rules", 0, "title"]])
    const again = await run({ rules: [{ title: "Unused" }], terms: [] }, cache).result
    expect(again).toMatchObject({ isValid: false, isCached: true })
  })
})

describe("model and version selection", () => {
  it("uses the prompt version's model and provider when it names them, and loads a pinned version", async () => {
    const model = createModel()
    const createModelFor = vi.fn<(modelId: string, pin?: { providers: readonly string[] }) => typeof model>(() => model)
    const loadPrompt = vi.fn<PromptLoader>(async (prompt) => ({
      name: prompt.name,
      version: 9,
      config: { model: "anthropic/claude-sonnet-5.5", provider: "google-vertex" },
      compile: () => "Pinned"
    }))

    const result = await runTextPrompt({
      loadPrompt,
      createModel: createModelFor,
      defaultModelId: "test-model",
      prompt,
      variables: {},
      promptVersion: 9,
      traceName: "sample-stage",
      environment: "test"
    })

    expect(loadPrompt).toHaveBeenCalledWith(prompt, { version: 9 })
    expect(createModelFor).toHaveBeenCalledWith("anthropic/claude-sonnet-5.5", { providers: ["google-vertex"] })
    expect(result).toMatchObject({ modelId: "anthropic/claude-sonnet-5.5", promptVersion: 9 })
  })

  it("asks OpenRouter for the version's reasoning effort, and only then", async () => {
    const run = async (config: { effort?: "high" }) => {
      const model = createModel()
      await runTextPrompt({
        loadPrompt: async (prompt) => ({ name: prompt.name, version: 1, config, compile: () => "Reason" }),
        createModel: () => model,
        defaultModelId: "test-model",
        prompt,
        variables: {},
        traceName: "sample-stage",
        environment: "test"
      })
      return model.doStreamCalls[0]?.providerOptions?.openrouter
    }

    expect(await run({ effort: "high" })).toMatchObject({ reasoning: { effort: "high" } })
    expect(await run({})).not.toHaveProperty("reasoning")
  })
})

describe("content cache", () => {
  it("answers a repeated call from the cache and misses when the input or the answer format changes", async () => {
    const stored = new Map<string, unknown>()
    const cache = {
      get: async (key: string) => stored.get(key),
      put: async (key: string, value: unknown) => {
        stored.set(key, value)
      }
    }
    const model = objectModel({ recommendation: "approve" })
    const run = (
      applicant: string,
      schema: z.ZodType<{ recommendation: string }> = z.object({ recommendation: z.string() })
    ) =>
      runObjectPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => model,
        defaultModelId: "test-model",
        prompt: applicantPrompt,
        schema,
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
    const reformatted = await run("Lot 12", z.object({ recommendation: z.enum(["approve", "deny"]) }))
    expect(reformatted.isCached).toBe(false)
    expect(model.doStreamCalls).toHaveLength(3)
    expect(stored.size).toBe(3)
  })
})

describe("outputSchema", () => {
  it("sends schemas used more than once as definitions when asked, and strict objects refuse extra fields", () => {
    const leaf = z.object({ value: z.number() })
    const schema = z.object({ a: leaf, b: leaf, only: z.strictObject({ name: z.string() }) })
    const inline = JSON.stringify(outputSchema(schema).jsonSchema)
    const shared = JSON.stringify(outputSchema(schema, undefined, true).jsonSchema)
    expect(shared).toContain("definitions")
    expect(inline).not.toContain("definitions")
    expect(shared).toContain('"additionalProperties":false')
  })

  it("writes unions as anyOf and literals as one-value enums, which every provider accepts, and still validates", async () => {
    const schema = outputSchema(z.object({ rules: z.array(ruleDraft) }))
    const json = JSON.stringify(await schema.jsonSchema)
    expect(json).not.toContain("oneOf")
    expect(json).toContain("anyOf")
    expect(json).not.toContain('"const"')
    expect(json).toContain('"enum":["discretion"]')
    expect(await schema.validate?.({ rules: [] })).toEqual({ success: true, value: { rules: [] } })
    expect((await schema.validate?.({ rules: [{}] }))?.success).toBe(false)
  })
})

describe("answerOf", () => {
  it("takes the respond tool's input, or JSON the model wrote as text", () => {
    expect(answerOf({ toolCalls: [{ toolName: "respond", input: { a: 1 } }], text: "" })).toEqual({ a: 1 })
    expect(answerOf({ toolCalls: [], text: 'Here it is:\n```json\n{"a": 2}\n```' })).toEqual({ a: 2 })
    expect(answerOf({ toolCalls: [], text: "{not json}" })).toBeUndefined()
    expect(answerOf({ toolCalls: [{ toolName: "other", input: {} }], text: "No answer." })).toBeUndefined()
  })
})

describe("prompt caching", () => {
  /** A prompt whose core terms every call shares, with the unit after them, as the encoding templates put them. */
  const encodingPrompt = {
    name: "hoa-test-encoding",
    variables: ["unit", "coreTerms"],
    sharedVariables: ["coreTerms"]
  } as const satisfies PromptDefinition
  const loadPrompt: PromptLoader = async (prompt) => ({
    name: prompt.name,
    version: 2,
    config: {},
    compile: (variables) => `Guide.\nCore terms:\n${variables?.coreTerms}\nThe unit:\n${variables?.unit}\nAnswer.`
  })

  /** OpenRouter's streamed reply: one text chunk, then the finish with usage, cached tokens and cost. */
  function openRouterStream() {
    const chunks = [
      { id: "gen-1", model: "anthropic/claude-opus-5.5", choices: [{ index: 0, delta: { content: "Done." } }] },
      {
        id: "gen-1",
        model: "anthropic/claude-opus-5.5",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 20_000,
          completion_tokens: 900,
          total_tokens: 20_900,
          prompt_tokens_details: { cached_tokens: 18_000, cache_write_tokens: 0 },
          cost: 0.05
        }
      }
    ]
    const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`
    return new Response(body, { headers: { "content-type": "text/event-stream" } })
  }

  it("marks the shared prefix for Anthropic's prompt cache in the request OpenRouter receives", async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return openRouterStream()
    })
    const model = createOpenRouter({ apiKey: "test-key", fetch }).chat("anthropic/claude-opus-5.5", {
      usage: { include: true }
    })

    const result = await runTextPrompt({
      loadPrompt,
      createModel: () => model,
      defaultModelId: "anthropic/claude-opus-5.5",
      prompt: encodingPrompt,
      variables: { unit: "Section 4.2", coreTerms: "owner | party" },
      traceName: "rule-finding",
      environment: "test"
    })

    expect(bodies[0]).toMatchObject({
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Guide.\nCore terms:\nowner | party\nThe unit:\n",
              cache_control: { type: "ephemeral" }
            },
            { type: "text", text: "Section 4.2\nAnswer." }
          ]
        }
      ]
    })
    expect(result).toMatchObject({
      text: "Done.",
      inputTokens: 20_000,
      cachedInputTokens: 18_000,
      cacheWriteTokens: 0,
      outputTokens: 900,
      costUsd: 0.05
    })
  })

  it("sends a chat prompt's system message as its own cached block, and caches the user message's shared part", async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return openRouterStream()
    })
    const model = createOpenRouter({ apiKey: "test-key", fetch }).chat("anthropic/claude-opus-5.5", {
      usage: { include: true }
    })
    const chatPrompt = { ...encodingPrompt, chat: true } as const satisfies PromptDefinition
    const messages = (variables?: Record<string, string>) => [
      { role: "system" as const, content: "You encode rules." },
      {
        role: "user" as const,
        content: `<core_terms>\n${variables?.coreTerms}\n</core_terms>\n<unit>\n${variables?.unit}\n</unit>`
      }
    ]
    await runTextPrompt({
      loadPrompt: async (prompt) => ({
        name: prompt.name,
        version: 1,
        config: {},
        messages,
        compile: (variables) =>
          messages(variables)
            .map((message) => message.content)
            .join("\n")
      }),
      createModel: () => model,
      defaultModelId: "anthropic/claude-opus-5.5",
      prompt: chatPrompt,
      variables: { unit: "Section 4.2", coreTerms: "owner | party" },
      traceName: "rule-finding",
      environment: "test"
    })
    expect(bodies[0]).toMatchObject({
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: "You encode rules.", cache_control: { type: "ephemeral" } }]
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "<core_terms>\nowner | party\n</core_terms>\n<unit>\n",
              cache_control: { type: "ephemeral" }
            },
            { type: "text", text: "Section 4.2\n</unit>" }
          ]
        }
      ]
    })
  })

  it("splits at the first variable that isn't shared, and marks nothing for a prompt without shared variables", async () => {
    const template = { name: "t", version: 1, config: {}, compile: (await loadPrompt(encodingPrompt)).compile }
    const variables = { unit: "U", coreTerms: "C" }
    const compiled = template.compile(variables)
    expect(sharedPrefix(template, encodingPrompt, variables, compiled)).toEqual({
      shared: "Guide.\nCore terms:\nC\nThe unit:\n",
      rest: "U\nAnswer."
    })
    expect(sharedPrefix(template, applicantPrompt, variables, compiled)).toEqual({ shared: "", rest: compiled })

    const model = createModel()
    await runTextPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: applicantPrompt,
      variables: { applicant: "Lot 12" },
      traceName: "sample-stage",
      environment: "test"
    })
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).not.toContain("cacheControl")
  })
})

describe("retries", () => {
  const rateLimited = (headers: Record<string, string> = {}) =>
    new APICallError({
      message: "Rate limit exceeded",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: headers,
      isRetryable: true
    })

  it("waits and retries a rate-limited call instead of failing it, honoring retry-after", async () => {
    const waits: number[] = []
    let calls = 0
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls += 1
        if (calls === 1) {
          throw rateLimited({ "retry-after": "7" })
        }
        if (calls === 2) {
          throw rateLimited()
        }
        return replyStream({ toolInput: { recommendation: "approve" } })
      }
    })

    const result = await runObjectPrompt({
      loadPrompt: langfusePrompt,
      createModel: () => model,
      defaultModelId: "test-model",
      prompt: applicantPrompt,
      variables: { applicant: "Lot 12" },
      schema: z.object({ recommendation: z.string() }),
      traceName: "rule-finding",
      environment: "test",
      retry: { ...defaultRetry, sleep: async (ms) => void waits.push(ms) }
    })

    expect(result.object).toEqual({ recommendation: "approve" })
    expect(calls).toBe(3)
    // The provider's 7 seconds, then the second attempt's backoff: twice the base delay.
    expect(waits).toEqual([7000, 2 * defaultRetry.baseDelayMs])
  })

  it("gives up after the policy's attempts, and never retries a call the provider rejects outright", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    const failing = (error: Error) =>
      new MockLanguageModelV4({
        doStream: async () => {
          throw error
        }
      })
    const run = (model: MockLanguageModelV4) =>
      runTextPrompt({
        loadPrompt: langfusePrompt,
        createModel: () => model,
        defaultModelId: "test-model",
        prompt,
        variables: {},
        traceName: "sample-stage",
        environment: "test",
        retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep }
      })

    const limited = failing(rateLimited())
    await expect(run(limited)).rejects.toThrow("Rate limit exceeded")
    expect(limited.doStreamCalls).toHaveLength(3)

    const badRequest = new APICallError({
      message: "Bad request",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false
    })
    const refused = failing(badRequest)
    await expect(run(refused)).rejects.toThrow("Bad request")
    expect(refused.doStreamCalls).toHaveLength(1)
    expect(isRetryableCall(badRequest)).toBe(false)

    const dropped = failing(new Error("Network connection lost."))
    await expect(run(dropped)).rejects.toThrow("Network connection lost.")
    expect(dropped.doStreamCalls).toHaveLength(3)
  })
})
