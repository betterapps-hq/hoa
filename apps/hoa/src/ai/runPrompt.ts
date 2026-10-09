import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"
import { isSpanContextValid } from "@opentelemetry/api"
import { generateText, jsonSchema, tool, type LanguageModel, type ModelMessage, type ProviderMetadata } from "ai"
import { z } from "zod"
import type { PromptLoader } from "./promptLoader"
import type { PromptDefinition, PromptVariables } from "./prompts"

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

export type PromptRunOptions<Prompt extends PromptDefinition = PromptDefinition> = {
  loadPrompt: PromptLoader
  createModel: ModelFactory
  /** The model when the prompt version doesn't name one: `OPENROUTER_MODEL` or `OPENROUTER_SMALL_MODEL`. */
  defaultModelId: string
  prompt: Prompt
  /** A version the job pinned in resolve-prompts; without it, the prompt is loaded by the default label. */
  promptVersion?: number
  variables: PromptVariables<Prompt>
  attachments?: PromptAttachment[]
  /** Name of the Langfuse trace and of the app span that OpenRouter nests its generation under. */
  traceName: string
  environment: string
  sessionId?: string
  cache?: PromptCache
}

export type PromptRunMetrics = {
  promptName: string
  promptVersion: number
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

/**
 * Fields code fills in after the model answers, such as a rule's effective date: they're left out of the schema the
 * model sees, and `fill` sets them on the answer before Zod checks it.
 */
export type CodeFields = { names: readonly string[]; fill: (answer: unknown) => unknown }

export type ObjectPromptOptions<T, Prompt extends PromptDefinition = PromptDefinition> = PromptRunOptions<Prompt> & {
  schema: z.ZodType<T>
  codeFields?: CodeFields
}

/** An answer checked against its schema: the parsed object, or the answer as given with Zod's issues. */
export type CheckedAnswer<T> =
  | { isValid: true; object: T }
  | { isValid: false; answer: unknown; issues: z.core.$ZodIssue[] }
export type CheckedObjectPromptResult<T> = PromptRunMetrics & CheckedAnswer<T>

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
  /** What the cache stores and the span shows for a result. */
  encode: (value: T) => unknown
  /** Validates a cached value. */
  decode: (value: unknown) => T
}

const openRouterCost = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number() }) }) })

/** Runs a Langfuse-managed prompt and returns the model's text. */
export async function runTextPrompt<Prompt extends PromptDefinition>(
  options: PromptRunOptions<Prompt>
): Promise<TextPromptResult> {
  const { value, ...metrics } = await runTraced(options, {
    generate: async (request) => {
      const result = await generateText(request)
      return { value: result.text, usage: result.usage, providerMetadata: result.providerMetadata }
    },
    encode: (text) => text,
    decode: (value) => z.string().parse(value)
  })
  return { ...metrics, text: value }
}

/** Writes `oneOf` as `anyOf`, and drops the properties code fills in from every object and its required list. */
function forModel(value: unknown, hidden: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => forModel(item, hidden))
  }
  if (typeof value !== "object" || value === null) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "properties" && typeof item === "object" && item !== null) {
        const shown = Object.entries(item).filter(([name]) => !hidden.has(name))
        return [key, Object.fromEntries(shown.map(([name, property]) => [name, forModel(property, hidden)]))]
      }
      if (key === "required" && Array.isArray(item)) {
        return [key, item.filter((name) => typeof name !== "string" || !hidden.has(name))]
      }
      return [key === "oneOf" ? "anyOf" : key, forModel(item, hidden)]
    })
  )
}

function checkAnswer<T>(schema: z.ZodType<T>, answer: unknown, codeFields?: CodeFields): CheckedAnswer<T> {
  const filled = codeFields ? codeFields.fill(answer) : answer
  const parsed = schema.safeParse(filled)
  return parsed.success
    ? { isValid: true, object: parsed.data }
    : { isValid: false, answer: filled, issues: parsed.error.issues }
}

/**
 * The JSON schema the model answers with. Zod writes discriminated unions as `oneOf`, which Anthropic's models on Vertex
 * and Bedrock refuse; `anyOf` accepts the same objects because each branch has a distinct literal discriminator. Fields
 * code fills in are left out, and filled before the answer is validated.
 */
export function outputSchema<T>(schema: z.ZodType<T>, codeFields?: CodeFields) {
  const json = forModel(
    z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: "inline" }),
    new Set(codeFields?.names ?? [])
  )
  return jsonSchema<T>(z.record(z.string(), z.unknown()).parse(json), {
    validate: (value) => {
      const result = checkAnswer(schema, value, codeFields)
      return result.isValid
        ? { success: true, value: result.object }
        : { success: false, error: new z.ZodError(result.issues) }
    }
  })
}

const respondTool = "respond"

/** The answer from a tool call, or from a JSON reply when the model answered in text instead. */
export function answerOf(result: { toolCalls: readonly { toolName: string; input: unknown }[]; text: string }) {
  const call = result.toolCalls.find((item) => item.toolName === respondTool)
  if (call) {
    return call.input
  }
  const json = /\{[\s\S]*\}/.exec(result.text)?.[0]
  if (!json) {
    return undefined
  }
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

/**
 * Runs a Langfuse-managed prompt and returns JSON validated against `schema`. The model answers by calling a `respond`
 * tool rather than through structured output: providers compile a structured-output schema into a grammar, and the
 * rule schemas are larger than they accept. Tool input isn't grammar-constrained, so Zod validates it, and an invalid
 * answer throws so the Workflow step retries. The tool isn't forced: Claude Opus 5.5 refuses a forced tool choice, so
 * the only tool is offered and a JSON text reply is accepted too.
 */
export async function runObjectPrompt<T, Prompt extends PromptDefinition>(
  options: ObjectPromptOptions<T, Prompt>
): Promise<ObjectPromptResult<T>> {
  const { value, ...metrics } = await runObject(options, false)
  if (!value.isValid) {
    throw invalidAnswer(value.issues)
  }
  return { ...metrics, object: value.object }
}

/**
 * Like `runObjectPrompt`, but an answer that fails Zod comes back with its issues instead of throwing, so a stage that
 * repairs answers (encoding) sends it to repair rather than retrying the call blind. Invalid answers are cached too.
 */
export async function runCheckedObjectPrompt<T, Prompt extends PromptDefinition>(
  options: ObjectPromptOptions<T, Prompt>
): Promise<CheckedObjectPromptResult<T>> {
  const { value, ...metrics } = await runObject(options, true)
  return { ...metrics, ...value }
}

function invalidAnswer(issues: z.core.$ZodIssue[]) {
  return new Error(`No object generated: the answer didn't match the schema. ${new z.ZodError(issues).message}`)
}

function runObject<T>(options: ObjectPromptOptions<T>, keepsInvalid: boolean) {
  const inputSchema = outputSchema(options.schema, options.codeFields)
  const check = (answer: unknown) => {
    const checked = checkAnswer(options.schema, answer, options.codeFields)
    if (!checked.isValid && !keepsInvalid) {
      throw invalidAnswer(checked.issues)
    }
    return checked
  }
  return runTraced(options, {
    generate: async (request) => {
      const result = await generateText({
        ...request,
        tools: {
          [respondTool]: tool({ description: "Call this once with your complete answer.", inputSchema })
        },
        toolChoice: "auto"
      })
      return { value: check(answerOf(result)), usage: result.usage, providerMetadata: result.providerMetadata }
    },
    encode: (checked: CheckedAnswer<T>) => (checked.isValid ? checked.object : checked.answer),
    decode: check
  })
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
      span.update({ output: { result: generator.encode(value), isCached: true } })
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
    await options.cache.put(cacheKey, generator.encode(generated.value))
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
  span.update({ output: { result: generator.encode(generated.value), latencyMs, costUsd: run.costUsd } })
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
