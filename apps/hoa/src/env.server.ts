import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// Credentials are optional so the app starts before OpenRouter and Langfuse are set up; features report what's missing.
export const env = createEnv({
  server: {
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-haiku-5.5"),
    // Routing, structure and classification. Defaults to OPENROUTER_MODEL.
    OPENROUTER_SMALL_MODEL: z.string().min(1).optional(),
    // Model calls a rulebook build stage runs at once (encoding.md, Cost and scale).
    ENCODING_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
    LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
    LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
    LANGFUSE_BASE_URL: z.url().default("https://us.cloud.langfuse.com"),
    LANGFUSE_PROMPT_LABEL: z.string().min(1).default("production"),
    LANGFUSE_TRACING_ENVIRONMENT: z.string().min(1).default("development"),
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.url().optional(),
    AZURE_DOCUMENT_INTELLIGENCE_KEY: z.string().min(1).optional(),
    // Presigned R2 URLs: an R2 API token scoped to this environment's bucket.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // Accounts (docs/design/people.md). The secret signs sessions: required outside local development.
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    // Where the app is served, for links in emails and Google's redirect; taken from the request when unset.
    BETTER_AUTH_URL: z.url().optional(),
    // "Continue with Google" shows only when both are set.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Email through Resend: sign-in codes and invitations. Without them, local development prints emails to the log.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional()
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
})
