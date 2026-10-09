import { z } from "zod"

// Small schemas that several records share.

export const errorInfoSchema = z.object({ stage: z.string(), message: z.string(), isRetryable: z.boolean() })

/** The Langfuse prompt version a model call used. */
export const promptVersionSchema = z.number().int()
