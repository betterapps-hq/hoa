import { z } from "zod"
import { errorInfoSchema, promptVersionSchema } from "@/shared/schemas"
import { jobProgress } from "./progress"

export const jobKinds = ["document-ingest", "rulebook-build", "application-review"] as const

export const jobFailureSchema = z.object({ stage: z.string(), itemId: z.string(), message: z.string() })
export type JobFailure = z.infer<typeof jobFailureSchema>

export const jobSchema = z.object({
  /** The Workflow instance id, also the Langfuse session id. */
  id: z.string(),
  organizationId: z.string(),
  kind: z.enum(jobKinds),
  subjectId: z.string(),
  /** `cancelled`: an administrator stopped it. */
  status: z.enum(["running", "completed", "completed-with-errors", "failed", "cancelled"]),
  stage: z.string().nullable(),
  done: z.number().int(),
  total: z.number().int(),
  promptVersions: z.record(z.string(), promptVersionSchema),
  failures: z.array(jobFailureSchema),
  error: errorInfoSchema.nullable(),
  /** Every step the job works through and where it is; null for jobs that report only a stage and a count. */
  progress: jobProgress.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type Job = z.infer<typeof jobSchema>
