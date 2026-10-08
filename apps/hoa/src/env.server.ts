import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// Credentials are optional so the app starts before OpenRouter and Langfuse are set up; features report what's missing.
export const env = createEnv({
  server: {
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-haiku-5.5"),
    LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
    LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
    LANGFUSE_BASE_URL: z.url().default("https://us.cloud.langfuse.com"),
    LANGFUSE_PROMPT_LABEL: z.string().min(1).default("production"),
    LANGFUSE_TRACING_ENVIRONMENT: z.string().min(1).default("development")
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
})
