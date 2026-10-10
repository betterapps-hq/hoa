import { z } from "zod"
import { errorInfoSchema } from "@/shared/schemas"

// The rulebook record: one row per build, draft, published version or failure (docs/design/documents.md). Its rules,
// terms and settings are the rules schema's, stored in their own tables (rulebookContentRepository).

export const rulebookSchema = z.object({
  id: z.string(),
  hoaId: z.string(),
  version: z.number().int().positive().nullable(),
  /** `cancelled`: an administrator stopped its build. */
  status: z.enum(["building", "draft", "published", "superseded", "failed", "cancelled"]),
  error: errorInfoSchema.nullable(),
  catalogVersion: z.number().int(),
  sourceDocumentIds: z.array(z.string()),
  jobId: z.string(),
  createdAt: z.string(),
  publishedBy: z.string().nullable(),
  publishedAt: z.string().nullable()
})
