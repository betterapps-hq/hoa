import { z } from "zod"
import { errorInfoSchema, promptVersionSchema } from "@/shared/schemas"

export const jobKinds = ["document-ingest", "rulebook-build", "application-review"] as const

export const jobFailureSchema = z.object({ stage: z.string(), itemId: z.string(), message: z.string() })

export const jobSchema = z.object({
  /** The Workflow instance id, also the Langfuse session id. */
  id: z.string(),
  hoaId: z.string(),
  kind: z.enum(jobKinds),
  subjectId: z.string(),
  status: z.enum(["running", "completed", "completed-with-errors", "failed"]),
  stage: z.string().nullable(),
  done: z.number().int(),
  total: z.number().int(),
  promptVersions: z.record(z.string(), promptVersionSchema),
  failures: z.array(jobFailureSchema),
  error: errorInfoSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type Job = z.infer<typeof jobSchema>
