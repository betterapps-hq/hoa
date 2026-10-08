import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"
import { isSpanContextValid } from "@opentelemetry/api"
import { generateText, Output, type LanguageModel, type ModelMessage, type ProviderMetadata } from "ai"
import { z } from "zod"
import type { PromptDefinition } from "./prompts"

export type PromptTemplate = {
  name: string
  version: number
  isFallback: boolean
  compile: (variables?: Record<string, string>) => string
}

/** Loads a prompt from Langfuse prompt management, or its fallback text when Langfuse can't supply it. */
export type PromptLoader = (prompt: PromptDefinition) => Promise<PromptTemplate>

/** Content sent alongside the prompt: an uploaded file (PDF or image) or extracted text. */
export type PromptAttachment =
  | { type: "file"; filename: string; mediaType: string; data: Uint8Array }
  | { type: "text"; text: string }

export type PromptRunOptions = {
  loadPrompt: PromptLoader
  model: LanguageModel
  prompt: PromptDefinition
  variables?: Record<string, string>
  attachments?: PromptAttachment[]
  /** Name of the Langfuse trace and of the app span that OpenRouter nests its generation under. */
  traceName: string
  environment: string
  sessionId?: string
}

export type PromptRunMetrics = {
  promptName: string
  /** `null` when the fallback text was used instead of a Langfuse prompt version. */
  promptVersion: number | null
  inputTokens: number | undefined
  outputTokens: number | undefined
  /** Billed cost reported by OpenRouter, in US dollars. */
  costUsd: number | undefined
  latencyMs: number
  /** Langfuse trace ID, when tracing is on. */
  traceId: string | undefined
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

const openRouterCost = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number() }) }) })

/** Runs a Langfuse-managed prompt and returns the model's text. */
export async function runTextPrompt(options: PromptRunOptions): Promise<TextPromptResult> {
  const { value, ...metrics } = await runTraced(options, async (request) => {
    const result = await generateText(request)
    return { value: result.text, usage: result.usage, providerMetadata: result.providerMetadata }
  })
  return { ...metrics, text: value }
}

/** Runs a Langfuse-managed prompt and returns JSON validated against `schema`. */
export async function runObjectPrompt<T>(
  options: PromptRunOptions & { schema: z.ZodType<T> }
): Promise<ObjectPromptResult<T>> {
  const { value, ...metrics } = await runTraced(options, async (request) => {
    const result = await generateText({ ...request, output: Output.object({ schema: options.schema }) })
    return { value: result.output, usage: result.usage, providerMetadata: result.providerMetadata }
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
function runTraced<T>(options: PromptRunOptions, generate: (request: GenerateRequest) => Promise<Generated<T>>) {
  return propagateAttributes(
    {
      traceName: options.traceName,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId })
    },
    () => startActiveObservation(options.traceName, (span) => runInSpan(options, span, generate))
  )
}

async function runInSpan<T>(
  options: PromptRunOptions,
  span: LangfuseSpan,
  generate: (request: GenerateRequest) => Promise<Generated<T>>
): Promise<PromptRunMetrics & { value: T }> {
  const template = await options.loadPrompt(options.prompt)
  const promptVersion = template.isFallback ? null : template.version
  const isTraced = isSpanContextValid(span.otelSpan.spanContext())
  const attachments = options.attachments ?? []
  span.update({
    input: {
      variables: options.variables ?? {},
      attachments: attachments.map((attachment) =>
        attachment.type === "file" ? attachment.filename : `${attachment.text.length} characters of text`
      )
    },
    metadata: { promptName: template.name, promptVersion: promptVersion ?? "fallback" }
  })

  const startedAt = performance.now()
  const generated = await generate({
    model: options.model,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: template.compile(options.variables) }, ...attachments.map(toContentPart)]
      }
    ],
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
                prompt_version: promptVersion === null ? "fallback" : String(promptVersion)
              }
            }
          : {})
      }
    }
  })
  const latencyMs = Math.round(performance.now() - startedAt)

  const cost = openRouterCost.safeParse(generated.providerMetadata)
  const run = {
    value: generated.value,
    promptName: template.name,
    promptVersion,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    costUsd: cost.success ? cost.data.openrouter.usage.cost : undefined,
    latencyMs,
    traceId: isTraced ? span.traceId : undefined
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
