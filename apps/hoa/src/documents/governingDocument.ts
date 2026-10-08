import { z } from "zod"
import { projectTypeIds } from "@/rules/catalog"
import { ruleTopics } from "@/rules/rule"

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
