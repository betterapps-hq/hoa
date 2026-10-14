import { z } from "zod"
import { errorInfoSchema } from "@/shared/schemas"

// Governing documents and their sections (docs/design/documents.md).

export const governingDocumentKinds = [
  "declaration",
  "bylaws",
  "rules-and-regulations",
  "design-guidelines",
  "amendment",
  "form"
] as const
export type GoverningDocumentKind = (typeof governingDocumentKinds)[number]

export const governingDocumentSchema = z.object({
  /** One id per uploaded version; pages, sections and citations use it. */
  id: z.string(),
  lineageId: z.string(),
  version: z.number().int().positive(),
  organizationId: z.string(),
  kind: z.enum(governingDocumentKinds),
  amends: z.string().nullable(),
  title: z.string(),
  effectiveDate: z.string().nullable(),
  fileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  status: z.enum(["uploading", "processing", "ready", "failed"]),
  error: errorInfoSchema.nullable(),
  uploadedBy: z.string(),
  uploadedAt: z.string()
})
export type GoverningDocument = z.infer<typeof governingDocumentSchema>

export const sectionRoutingSchema = z.object({
  projectTypes: z.array(z.string()),
  topics: z.array(z.string()),
  isRelevant: z.boolean()
})

export type Section = {
  /** "{documentId}:{ordinal}" */
  id: string
  documentId: string
  ordinal: number
  number: string | null
  heading: string
  kind: "body" | "definitions" | "exhibit"
  parentId: string | null
  pageStart: number
  pageEnd: number
  startOffset: number
  endOffset: number
  references: string[]
  routing: z.infer<typeof sectionRoutingSchema> | null
}
