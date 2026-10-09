import type { Database } from "@/db/database"
import { createGoverningDocument, type BuiltDocuments } from "@/db/documentRepository"
import type { RulebookContent } from "@/db/rulebookContentRepository"
import { insertRulebook } from "@/db/rulebookRepository"
import { hoas } from "@/db/schema"
import type { RulebookRecords } from "@/rulebook/assemble"
import { buildSettings } from "@/schema/defaultSettings"
import type { GoverningDocument, Provenance, Provision, Review, Rule, Term } from "@/schema/types"
import { ruleDraft } from "@/schema/zod"
import { draftDocuments, draftProvisions, heightRule, vocabulary } from "./encodingDrafts"

// A small built draft for the save-draft and publish tests: the shed rules' two documents from one upload (the
// declaration and its rules as a document of their own), the By-Laws they name, and one approved rule.

export const hoaId = "demo-hoa"
export const now = "2026-10-09T00:00:00.000Z"

const provenance: Provenance = { by: "extraction", at: now }
export const approved: Review = { status: "approved", by: "admin", at: now, note: null }

export const builtRule: Rule = {
  ...ruleDraft.parse(heightRule("rules:1#max-height", "rules:1")),
  provenance,
  review: approved,
  issues: []
}

const builtTerms: Term[] = vocabulary.map((term) => ({
  ...term,
  organizationId: hoaId,
  labels: term.labels.map((label) => ({ ...label, provenance })),
  provenance,
  review: approved,
  issues: []
}))

export const builtContent: RulebookContent = {
  settings: { ...buildSettings({}, []), review: approved },
  coverage: { provisions: draftProvisions.length, uncovered: [] },
  rules: [builtRule],
  terms: builtTerms,
  questions: []
}

const reviewedReason = { reason: "explanatory" as const, note: null, review: approved }

/** The draft's provisions: the rule cites rules:1, and every other one has an approved reason for having no rule. */
export const builtProvisions: Provision[] = draftProvisions.map((provision) =>
  provision.key === "rules:1" ? provision : { ...provision, noRule: reviewedReason }
)

const byLaws: GoverningDocument = {
  key: "by-laws",
  kind: "bylaws",
  title: "By-Laws",
  issuedBy: null,
  governs: null,
  edition: null
}

/** The draft's records as publishing reads them. */
export const builtRecords: RulebookRecords = {
  organization: { id: hoaId, name: "Maple Hollow" },
  documents: [...draftDocuments, byLaws],
  provisions: builtProvisions,
  terms: builtContent.terms,
  rules: builtContent.rules,
  settings: builtContent.settings,
  questions: []
}

/** Inserts the organization and an upload, and returns the documents a build of that upload would save. */
export async function seedUpload(db: Database): Promise<BuiltDocuments> {
  await db.insert(hoas).values({ id: hoaId, name: "Maple Hollow", slug: "maple-hollow", settings: {}, createdAt: now })
  const upload = await createGoverningDocument(db, {
    hoaId,
    kind: "declaration",
    title: "Declaration",
    effectiveDate: "2025-01-01",
    fileName: "declaration.pdf",
    mediaType: "application/pdf",
    sizeBytes: 100,
    uploadedBy: "admin",
    uploadedAt: now
  })
  const provisionsOf = (key: string) => builtProvisions.filter((provision) => provision.key.startsWith(`${key}:`))
  return {
    uploads: [
      {
        documentId: upload.id,
        documents: draftDocuments.map((document) => ({ document, provisions: provisionsOf(document.key) }))
      }
    ],
    referenced: [byLaws]
  }
}

export async function insertBuildingRulebook(db: Database, id: string, status: "building" | "draft" = "building") {
  await insertRulebook(db, {
    id,
    hoaId,
    version: null,
    status,
    error: null,
    catalogVersion: 0,
    sourceDocumentIds: [],
    jobId: `job-${id}`,
    createdAt: now,
    publishedBy: null,
    publishedAt: null
  })
}
