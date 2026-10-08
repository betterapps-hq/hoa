import type { TextPromptResult } from "@/ai/runPrompt"

export type ModelCheckResult =
  | { status: "not-configured"; missing: string[] }
  | { status: "failed"; message: string }
  | ({ status: "succeeded"; modelId: string; isLangfuseConfigured: boolean } & TextPromptResult)
