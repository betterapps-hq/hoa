import { z } from "zod"
import { projectTypeIds } from "@/rules/catalog"
import { errorInfoSchema, ruleTopics } from "@/rules/rule"

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

/** Authority for resolving conflicts: lower ranks win (docs/design/rules.md, "Authority and conflicts"). */
export const authorityRank: Record<GoverningDocumentKind, number> = {
  declaration: 1,
  bylaws: 2,
  "rules-and-regulations": 3,
  "design-guidelines": 3,
  amendment: 3,
  form: 4
}

export const governingDocumentSchema = z.object({
  /** One id per uploaded version; pages, sections and citations use it. */
  id: z.string(),
  lineageId: z.string(),
  version: z.number().int().positive(),
  hoaId: z.string(),
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
  projectTypes: z.array(z.enum(projectTypeIds)),
  topics: z.array(z.enum(ruleTopics)),
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
