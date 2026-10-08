import { LangfuseSpanProcessor } from "@langfuse/otel"
import { context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base"

type TelemetrySettings = {
  publicKey: string
  secretKey: string
  baseUrl: string
  environment: string
}

declare global {
  // Survives dev-server module reloads so the global tracer provider is registered once per isolate.
  var __hoaTracerProvider: BasicTracerProvider | undefined
}

/**
 * Registers the OpenTelemetry provider that exports the app's spans to Langfuse. Model generations are not traced
 * here: OpenRouter Broadcast delivers them, with billed cost, and nests them under the app's span.
 *
 * Workers have no Node tracer provider, so the context manager is registered explicitly: `propagateAttributes` and
 * active observations rely on it to carry the trace name and session ID onto every span.
 */
export function startTelemetry(settings: TelemetrySettings) {
  if (!globalThis.__hoaTracerProvider) {
    const provider = new BasicTracerProvider({
      spanProcessors: [new LangfuseSpanProcessor({ ...settings, exportMode: "immediate" })]
    })
    registerTracerProvider(provider)
    globalThis.__hoaTracerProvider = provider
  }
  return globalThis.__hoaTracerProvider
}

/** Makes `provider` the global tracer provider, with a context manager that keeps the active span across awaits. */
export function registerTracerProvider(provider: BasicTracerProvider) {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  trace.setGlobalTracerProvider(provider)
}
