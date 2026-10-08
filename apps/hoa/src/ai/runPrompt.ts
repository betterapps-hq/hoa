import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"
import { isSpanContextValid } from "@opentelemetry/api"
import { generateText, Output, type LanguageModel, type ModelMessage, type ProviderMetadata } from "ai"
import { z } from "zod"
import type { PromptLoader } from "./promptLoader"
import type { PromptDefinition } from "./prompts"

/** Builds a model by id. The prompt version's `config.model` picks the id, else the stage's default. */
export type ModelFactory = (modelId: string) => LanguageModel

/** Content sent alongside the prompt: an uploaded file (PDF or image) or extracted text. */
export type PromptAttachment =
  | { type: "file"; filename: string; mediaType: string; data: Uint8Array }
  | { type: "text"; text: string }

/**
 * Stores model results by content (docs/design/platform.md, "Caching"). The key covers the trace name, model, compiled
 * prompt and attachments, so any change to those misses the cache and nothing else does.
 */
export type PromptCache = {
  get: (key: string) => Promise<unknown>
  put: (key: string, value: unknown) => Promise<void>
}

export type PromptRunOptions = {
  loadPrompt: PromptLoader
  createModel: ModelFactory
  /** The model when the prompt version doesn't name one: `OPENROUTER_MODEL` or `OPENROUTER_SMALL_MODEL`. */
  defaultModelId: string
  prompt: PromptDefinition
  /** A version the job pinned in resolve-prompts; without it, the prompt is loaded by the default label. */
  promptVersion?: number | "fallback"
  variables?: Record<string, string>
  attachments?: PromptAttachment[]
  /** Name of the Langfuse trace and of the app span that OpenRouter nests its generation under. */
  traceName: string
  environment: string
  sessionId?: string
  cache?: PromptCache
}

export type PromptRunMetrics = {
  promptName: string
  /** "fallback" when the text came from prompts.ts instead of a Langfuse prompt version. */
  promptVersion: number | "fallback"
  modelId: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  /** Billed cost reported by OpenRouter, in US dollars; 0 for a cached result. */
  costUsd: number | undefined
  latencyMs: number
  /** Langfuse trace ID, when tracing is on. */
  traceId: string | undefined
  isCached: boolean
}

export type TextPromptResult = PromptRunMetrics & { text: string }
export type ObjectPromptResult<T> = PromptRunMetrics & { object: T }

type GenerateRequest = {
  model: LanguageModel
  messages: ModelMessage[]
  providerOptions: { openrouter: Record<string, string | Record<string, string>> }
}

type Generated<T> = {
  value: T
  usage: { inputTokens: number | undefined; outputTokens: number | undefined }
  providerMetadata: ProviderMetadata | undefined
}

type Generator<T> = {
  generate: (request: GenerateRequest) => Promise<Generated<T>>
  /** Validates a cached value. */
  decode: (value: unknown) => T
}

const openRouterCost = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number() }) }) })

/** Runs a Langfuse-managed prompt and returns the model's text. */
export async function runTextPrompt(options: PromptRunOptions): Promise<TextPromptResult> {
  const { value, ...metrics } = await runTraced(options, {
    generate: async (request) => {
      const result = await generateText(request)
      return { value: result.text, usage: result.usage, providerMetadata: result.providerMetadata }
    },
    decode: (value) => z.string().parse(value)
  })
  return { ...metrics, text: value }
}

/** Runs a Langfuse-managed prompt and returns JSON validated against `schema`. */
export async function runObjectPrompt<T>(
  options: PromptRunOptions & { schema: z.ZodType<T> }
): Promise<ObjectPromptResult<T>> {
  const { value, ...metrics } = await runTraced(options, {
    generate: async (request) => {
      const result = await generateText({ ...request, output: Output.object({ schema: options.schema }) })
      return { value: result.output, usage: result.usage, providerMetadata: result.providerMetadata }
    },
    decode: (value) => options.schema.parse(value)
  })
  return { ...metrics, object: value }
}

/**
 * Runs a prompt inside a Langfuse span. The span's trace and span IDs are sent to OpenRouter, so its Broadcast
 * generation (with token usage and billed cost) lands under this span in Langfuse.
 *
 * Langfuse v4 is observation-centric: the span is the root observation and holds the overall input and output, and the
 * trace name and session are propagated to every observation the app creates so filters and evaluators can use them.
 */
function runTraced<T>(options: PromptRunOptions, generator: Generator<T>) {
  return propagateAttributes(
    {
      traceName: options.traceName,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId })
    },
    () => startActiveObservation(options.traceName, (span) => runInSpan(options, span, generator))
  )
}

async function sha256(parts: readonly (string | Uint8Array)[]) {
  const encoder = new TextEncoder()
  const chunks = parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part))
  const total = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length + 1, 0))
  let offset = 0
  for (const chunk of chunks) {
    total.set(chunk, offset)
    offset += chunk.length + 1 // a zero byte between parts keeps ("ab", "c") apart from ("a", "bc")
  }
  const digest = await crypto.subtle.digest("SHA-256", total)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The cache key for one model call. */
function promptCacheKey(
  traceName: string,
  modelId: string,
  compiled: string,
  attachments: readonly PromptAttachment[]
) {
  return sha256([
    traceName,
    modelId,
    compiled,
    ...attachments.map((attachment) => (attachment.type === "file" ? attachment.data : attachment.text))
  ])
}

async function runInSpan<T>(
  options: PromptRunOptions,
  span: LangfuseSpan,
  generator: Generator<T>
): Promise<PromptRunMetrics & { value: T }> {
  const template = await options.loadPrompt(
    options.prompt,
    options.promptVersion === undefined ? undefined : { version: options.promptVersion }
  )
  const promptVersion = template.version
  const modelId = template.config.model ?? options.defaultModelId
  const isTraced = isSpanContextValid(span.otelSpan.spanContext())
  const traceId = isTraced ? span.traceId : undefined
  const attachments = options.attachments ?? []
  const compiled = template.compile(options.variables)
  span.update({
    input: {
      variables: options.variables ?? {},
      attachments: attachments.map((attachment) =>
        attachment.type === "file" ? attachment.filename : `${attachment.text.length} characters of text`
      )
    },
    metadata: { promptName: template.name, promptVersion, modelId }
  })

  const cacheKey = options.cache ? await promptCacheKey(options.traceName, modelId, compiled, attachments) : undefined
  if (options.cache && cacheKey) {
    const hit = await options.cache.get(cacheKey)
    if (hit !== undefined && hit !== null) {
      const value = generator.decode(hit)
      span.update({ output: { result: value, isCached: true } })
      const usage = { inputTokens: undefined, outputTokens: undefined, costUsd: 0, latencyMs: 0 }
      return { value, promptName: template.name, promptVersion, modelId, ...usage, traceId, isCached: true }
    }
  }

  const startedAt = performance.now()
  const generated = await generator.generate({
    model: options.createModel(modelId),
    messages: [{ role: "user", content: [{ type: "text", text: compiled }, ...attachments.map(toContentPart)] }],
    providerOptions: {
      openrouter: {
        ...(options.sessionId === undefined ? {} : { session_id: options.sessionId }),
        ...(isTraced
          ? {
              // Broadcast creates the cost-bearing generation, so it can't inherit propagated attributes: send them.
              // Keys beyond OpenRouter's named fields arrive in Langfuse as metadata.
              trace: {
                trace_id: span.traceId,
                parent_span_id: span.id,
                trace_name: options.traceName,
                generation_name: template.name,
                environment: options.environment,
                prompt_name: template.name,
                prompt_version: String(promptVersion)
              }
            }
          : {})
      }
    }
  })
  const latencyMs = Math.round(performance.now() - startedAt)
  if (options.cache && cacheKey) {
    await options.cache.put(cacheKey, generated.value)
  }

  const cost = openRouterCost.safeParse(generated.providerMetadata)
  const run = {
    value: generated.value,
    promptName: template.name,
    promptVersion,
    modelId,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    costUsd: cost.success ? cost.data.openrouter.usage.cost : undefined,
    latencyMs,
    traceId,
    isCached: false
  }
  span.update({ output: { result: generated.value, latencyMs, costUsd: run.costUsd } })
  return run
}

function toContentPart(attachment: PromptAttachment) {
  return attachment.type === "file"
    ? {
        type: "file" as const,
        data: attachment.data,
        mediaType: attachment.mediaType,
        filename: attachment.filename
      }
    : { type: "text" as const, text: attachment.text }
}
