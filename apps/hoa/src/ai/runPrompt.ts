import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"
import { isSpanContextValid } from "@opentelemetry/api"
import {
  APICallError,
  jsonSchema,
  streamText,
  tool,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type SystemModelMessage,
  type ProviderMetadata
} from "ai"
import { z } from "zod"
import type { PromptConfig, PromptLoader, PromptTemplate } from "./promptLoader"
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
  /** How a call the provider refuses for now (429, overloaded, 5xx) is retried; `defaultRetry` when left out. */
  retry?: RetryPolicy
}

/**
 * Retries for calls the provider refuses for now: a rate limit (429), an overloaded or failing provider (5xx) or a
 * timeout. Each waits for the provider's `retry-after` when it sends one, else `baseDelayMs` doubled per attempt, at
 * most `maxDelayMs`.
 */
export type RetryPolicy = {
  /** Calls in all, the first one included. */
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
  sleep: (ms: number) => Promise<void>
}

/**
 * Six calls over about two and a half minutes of waiting (5, 10, 20, 40 and 60 seconds), which stays well inside a
 * build step's timeout with a long encoding call after it; a step that still fails is retried by the Workflow.
 */
export const defaultRetry: RetryPolicy = {
  attempts: 6,
  baseDelayMs: 5000,
  maxDelayMs: 60_000,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
}

export type PromptRunMetrics = {
  promptName: string
  promptVersion: number
  modelId: string
  /** Every input token, cached or not. */
  inputTokens: number | undefined
  /** Input tokens read from the provider's prompt cache (billed at a tenth of the input price on Anthropic). */
  cachedInputTokens: number | undefined
  /** Input tokens written to the provider's prompt cache (billed at 1.25 times the input price on Anthropic). */
  cacheWriteTokens: number | undefined
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
  /** Send schemas used more than once (conditions, operands) once, as `$defs`, instead of inline at every use. */
  sharedDefinitions?: boolean
}

/** An answer checked against its schema: the parsed object, or the answer as given with Zod's issues. */
export type CheckedAnswer<T> =
  | { isValid: true; object: T }
  | { isValid: false; answer: unknown; issues: z.core.$ZodIssue[] }
export type CheckedObjectPromptResult<T> = PromptRunMetrics & CheckedAnswer<T>

type GenerateRequest = {
  model: LanguageModel
  /** A chat prompt's system message, with its cache breakpoint. */
  instructions?: SystemModelMessage
  messages: ModelMessage[]
  providerOptions: { openrouter: Record<string, string | Record<string, string>> }
}

type Generated<T> = {
  value: T
  usage: LanguageModelUsage
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

type StreamedCall = {
  consumeStream: () => PromiseLike<void>
  text: PromiseLike<string>
  toolCalls: PromiseLike<readonly { toolName: string; input: unknown }[]>
  totalUsage: PromiseLike<LanguageModelUsage>
  providerMetadata: PromiseLike<ProviderMetadata | undefined>
}

type StreamOptions = { maxRetries: number; onError: (event: { error: unknown }) => void }

/**
 * Starts a streamed call and reads it to its end, throwing the first error it reports. Calls stream so the response's
 * headers arrive at once: a Worker holds at most six connections waiting for headers, and a long encoding call that
 * answered only at the end would hold one for minutes. Retries are `withRetries`' job, so the SDK's own are off.
 */
async function streamed(start: (options: StreamOptions) => StreamedCall) {
  const errors: unknown[] = []
  const result = start({ maxRetries: 0, onError: ({ error }) => errors.push(error) })
  await result.consumeStream()
  if (errors.length > 0) {
    throw errors[0]
  }
  const [text, toolCalls, usage, providerMetadata] = await Promise.all([
    result.text,
    result.toolCalls,
    result.totalUsage,
    result.providerMetadata
  ])
  return { text, toolCalls, usage, providerMetadata }
}

/** Whether a failed call is worth retrying: a rate limit, an overloaded or failing provider, or a timeout. */
export function isRetryableCall(error: unknown) {
  return APICallError.isInstance(error) && (error.statusCode === 429 || error.isRetryable)
}

/** How long the provider asks to wait, from `retry-after-ms` or `retry-after` (seconds or a date), if it says. */
function retryAfterMs(error: unknown, now: number) {
  const headers = APICallError.isInstance(error) ? (error.responseHeaders ?? {}) : {}
  const milliseconds = Number(headers["retry-after-ms"])
  if (Number.isFinite(milliseconds) && milliseconds >= 0) {
    return milliseconds
  }
  const after = headers["retry-after"]
  if (after === undefined) {
    return null
  }
  const seconds = Number(after)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  const date = Date.parse(after)
  return Number.isNaN(date) ? null : Math.max(0, date - now)
}

/** Runs `call`, retrying it under `policy` while it fails with a retryable error. */
export async function withRetries<T>(policy: RetryPolicy, call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call()
    } catch (error) {
      if (attempt >= policy.attempts || !isRetryableCall(error)) {
        throw error
      }
      const backoff = policy.baseDelayMs * 2 ** (attempt - 1)
      const asked = retryAfterMs(error, Date.now())
      await policy.sleep(Math.min(policy.maxDelayMs, asked ?? backoff))
    }
  }
}

/** Runs a Langfuse-managed prompt and returns the model's text. */
export async function runTextPrompt<Prompt extends PromptDefinition>(
  options: PromptRunOptions<Prompt>
): Promise<TextPromptResult> {
  const { value, ...metrics } = await runTraced(options, {
    generate: async (request) => {
      const result = await streamed((options) => streamText({ ...request, ...options }))
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
  if (parsed.success) {
    return { isValid: true, object: parsed.data }
  }
  const repaired = parsedJsonStrings(answer, parsed.error.issues) ?? withoutNullStrays(answer, parsed.error.issues)
  return repaired === null
    ? { isValid: false, answer: filled, issues: parsed.error.issues }
    : checkAnswer(schema, repaired, codeFields)
}

/**
 * The answer without each key the schema doesn't know whose value is null; null when there's none. Claude models
 * sometimes add a stray null field beside a real one (`"kind_": null` next to `"kind"`), which says nothing.
 */
function withoutNullStrays(answer: unknown, issues: readonly z.core.$ZodIssue[]) {
  let result = answer
  for (const issue of issues) {
    if (issue.code !== "unrecognized_keys") {
      continue
    }
    const value = valueAt(result, issue.path)
    if (!isRecord(value)) {
      continue
    }
    const strays = issue.keys.filter((key) => value[key] === null)
    if (strays.length > 0) {
      result = withValueAt(
        result,
        issue.path,
        Object.fromEntries(Object.entries(value).filter(([key]) => !strays.includes(key)))
      )
    }
  }
  return result === answer ? null : result
}

/**
 * The answer with every value the model sent as JSON text, where the schema wants an object or an array, parsed; null
 * when there's none. Claude models sometimes send a large nested field of a tool call as its JSON text.
 */
function parsedJsonStrings(answer: unknown, issues: readonly z.core.$ZodIssue[]) {
  let result = answer
  for (const issue of issues) {
    if (issue.code !== "invalid_type" || (issue.expected !== "object" && issue.expected !== "array")) {
      continue
    }
    const value = valueAt(result, issue.path)
    const parsed = typeof value === "string" ? leadingJson(value) : undefined
    if (issue.expected === "array" ? Array.isArray(parsed) : isRecord(parsed)) {
      result = withValueAt(result, issue.path, parsed)
    }
  }
  return result === answer ? null : result
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * The JSON array or object a text starts with, ignoring what follows it: a model writing a field as JSON text sometimes
 * closes the object around it inside the text too.
 */
function leadingJson(text: string): unknown {
  const trimmed = text.trimStart()
  let depth = 0
  let isInString = false
  let isEscaped = false
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]
    if (isInString) {
      if (isEscaped) {
        isEscaped = false
      } else if (character === "\\") {
        isEscaped = true
      } else if (character === '"') {
        isInString = false
      }
      continue
    }
    if (character === '"') {
      isInString = true
    } else if (character === "[" || character === "{") {
      depth += 1
    } else if (character === "]" || character === "}") {
      depth -= 1
      if (depth === 0) {
        return parseJson(trimmed.slice(0, index + 1))
      }
    }
  }
  return undefined
}

function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  const [key, ...rest] = path
  if (key === undefined) {
    return value
  }
  if (Array.isArray(value) && typeof key === "number") {
    return valueAt(value[key], rest)
  }
  return isRecord(value) ? valueAt(value[key], rest) : undefined
}

function withValueAt(value: unknown, path: readonly PropertyKey[], replacement: unknown): unknown {
  const [key, ...rest] = path
  if (key === undefined) {
    return replacement
  }
  if (Array.isArray(value) && typeof key === "number") {
    return value.map((item, index) => (index === key ? withValueAt(item, rest, replacement) : item))
  }
  return isRecord(value) ? { ...value, [key]: withValueAt(value[key], rest, replacement) } : value
}

/**
 * The JSON schema the model answers with. Zod writes discriminated unions as `oneOf`, which Anthropic's models on Vertex
 * and Bedrock refuse; `anyOf` accepts the same objects because each branch has a distinct literal discriminator. Fields
 * code fills in are left out, and filled before the answer is validated.
 */
export function outputSchema<T>(schema: z.ZodType<T>, codeFields?: CodeFields, sharedDefinitions = false) {
  const json = forModel(
    z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: sharedDefinitions ? "ref" : "inline" }),
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
 * reruns failing answers (the rulebook build's steps) sends it back with its problems rather than retrying the call
 * blind. Invalid answers are cached too.
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
  const inputSchema = outputSchema(options.schema, options.codeFields, options.sharedDefinitions)
  const check = (answer: unknown) => {
    const checked = checkAnswer(options.schema, answer, options.codeFields)
    if (!checked.isValid && !keepsInvalid) {
      throw invalidAnswer(checked.issues)
    }
    return checked
  }
  return runTraced(options, {
    generate: async (request) => {
      const result = await streamed((options) =>
        streamText({
          ...request,
          ...options,
          tools: {
            [respondTool]: tool({ description: "Call this once with your complete answer.", inputSchema })
          },
          toolChoice: "auto"
        })
      )
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
  effort: PromptConfig["effort"],
  compiled: string,
  attachments: readonly PromptAttachment[]
) {
  return sha256([
    traceName,
    modelId,
    // Only when set, so answers cached at the model's default effort keep their keys.
    ...(effort === undefined ? [] : [`effort:${effort}`]),
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
  const { effort } = template.config
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
    metadata: { promptName: template.name, promptVersion, modelId, effort: effort ?? "default" }
  })

  const cacheKey = options.cache
    ? await promptCacheKey(options.traceName, modelId, effort, compiled, attachments)
    : undefined
  if (options.cache && cacheKey) {
    const hit = await options.cache.get(cacheKey)
    if (hit !== undefined && hit !== null) {
      const value = generator.decode(hit)
      span.update({ output: { result: generator.encode(value), isCached: true } })
      const usage = {
        inputTokens: undefined,
        cachedInputTokens: undefined,
        cacheWriteTokens: undefined,
        outputTokens: undefined,
        costUsd: 0,
        latencyMs: 0
      }
      return { value, promptName: template.name, promptVersion, modelId, ...usage, traceId, isCached: true }
    }
  }

  const startedAt = performance.now()
  const request: GenerateRequest = {
    model: options.createModel(modelId),
    ...requestMessages(template, options.prompt, options.variables, compiled, attachments),
    providerOptions: {
      openrouter: {
        ...(effort === undefined ? {} : { reasoning: { effort } }),
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
  }
  const generated = await withRetries(options.retry ?? defaultRetry, () => generator.generate(request))
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
    cachedInputTokens: generated.usage.inputTokenDetails.cacheReadTokens,
    cacheWriteTokens: generated.usage.inputTokenDetails.cacheWriteTokens,
    outputTokens: generated.usage.outputTokens,
    costUsd: cost.success ? cost.data.openrouter.usage.cost : undefined,
    latencyMs,
    traceId,
    isCached: false
  }
  span.update({
    output: {
      result: generator.encode(generated.value),
      latencyMs,
      costUsd: run.costUsd,
      usage: {
        input: run.inputTokens,
        input_cached: run.cachedInputTokens,
        input_cache_write: run.cacheWriteTokens,
        output: run.outputTokens
      }
    }
  })
  return run
}

const sharedMarker = "\u0000unit\u0000"

/**
 * The compiled prompt as the text every call of a stage shares and the rest. The shared text runs up to where the
 * first variable outside the prompt's `sharedVariables` begins (the instructions, the guide and, in the templates that
 * put them first, the core terms and request types), and gets a prompt-cache breakpoint. Without shared variables, or
 * when the template compiles differently than expected, nothing is shared.
 */
export function sharedPrefix(
  template: Pick<PromptTemplate, "compile">,
  prompt: PromptDefinition,
  variables: Record<string, string>,
  compiled: string
) {
  const sharedNames = new Set<string>(prompt.sharedVariables ?? [])
  if (sharedNames.size === 0) {
    return { shared: "", rest: compiled }
  }
  const probe = template.compile(
    Object.fromEntries(
      Object.entries(variables).map(([name, value]) => [name, sharedNames.has(name) ? value : sharedMarker])
    )
  )
  const at = probe.indexOf(sharedMarker)
  const shared = at < 0 ? probe : probe.slice(0, at)
  return compiled.startsWith(shared) ? { shared, rest: compiled.slice(shared.length) } : { shared: "", rest: compiled }
}

/**
 * Anthropic caches the request up to a marked block: the tools (the respond tool's schema), then the messages up to the
 * mark. Marking the end of the shared text caches both for five minutes, refreshed by every call that reads it.
 */
export const cacheBreakpoint = { openrouter: { cacheControl: { type: "ephemeral" } } } as const

/**
 * The request's messages. A text prompt is one user message, its shared prefix marked for the cache. A chat prompt's
 * system message is its own block with a breakpoint, and its user message gets the shared prefix's breakpoint too.
 */
function requestMessages(
  template: PromptTemplate,
  prompt: PromptDefinition,
  variables: Record<string, string>,
  compiled: string,
  attachments: readonly PromptAttachment[]
): Pick<GenerateRequest, "instructions" | "messages"> {
  const { messages } = template
  if (!messages) {
    const { shared, rest } = sharedPrefix(template, prompt, variables, compiled)
    return { messages: [{ role: "user", content: [...promptParts(shared, rest), ...attachments.map(toContentPart)] }] }
  }
  const userText = (values: Record<string, string>) =>
    messages(values)
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n")
  const system = messages(variables)
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n")
  const { shared, rest } = sharedPrefix(
    { compile: (values) => userText(values ?? {}) },
    prompt,
    variables,
    userText(variables)
  )
  return {
    ...(system ? { instructions: { role: "system", content: system, providerOptions: cacheBreakpoint } } : {}),
    messages: [{ role: "user", content: [...promptParts(shared, rest), ...attachments.map(toContentPart)] }]
  }
}

function promptParts(shared: string, rest: string) {
  return [
    ...(shared ? [{ type: "text" as const, text: shared, providerOptions: cacheBreakpoint }] : []),
    ...(rest || !shared ? [{ type: "text" as const, text: rest }] : [])
  ]
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
