import { and, asc, eq, max } from "drizzle-orm"
import { z } from "zod"
import {
  governingDocumentSchema,
  sectionRoutingSchema,
  type GoverningDocument,
  type Section
} from "@/documents/governingDocument"
import type { Database } from "./database"
import { governingDocuments, sections } from "./schema"

function toDocument(row: typeof governingDocuments.$inferSelect): GoverningDocument {
  return governingDocumentSchema.parse(row)
}

export type NewGoverningDocument = Pick<
  GoverningDocument,
  "hoaId" | "kind" | "title" | "effectiveDate" | "fileName" | "mediaType" | "sizeBytes" | "uploadedBy" | "uploadedAt"
> & {
  /** The lineage this upload is a new version of; omitted for a new document. */
  lineageId?: string
  amends?: string | null
}

/** Records an upload. A new version of an existing document joins its lineage with the next version number. */
export async function createGoverningDocument(db: Database, input: NewGoverningDocument): Promise<GoverningDocument> {
  const id = crypto.randomUUID()
  const lineageId = input.lineageId ?? id
  const latest = await db
    .select({ version: max(governingDocuments.version) })
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, input.hoaId), eq(governingDocuments.lineageId, lineageId)))
    .get()
  const document: GoverningDocument = {
    id,
    lineageId,
    version: (latest?.version ?? 0) + 1,
    hoaId: input.hoaId,
    kind: input.kind,
    amends: input.amends ?? null,
    title: input.title,
    effectiveDate: input.effectiveDate,
    fileName: input.fileName,
    mediaType: input.mediaType,
    sizeBytes: input.sizeBytes,
    sha256: null,
    pageCount: null,
    status: "uploading",
    error: null,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt
  }
  await db.insert(governingDocuments).values(document)
  return document
}

export async function getGoverningDocument(db: Database, hoaId: string, id: string) {
  const row = await db
    .select()
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.id, id)))
    .get()
  return row ? toDocument(row) : null
}

export async function listGoverningDocuments(db: Database, hoaId: string) {
  const rows = await db
    .select()
    .from(governingDocuments)
    .where(eq(governingDocuments.hoaId, hoaId))
    .orderBy(asc(governingDocuments.uploadedAt))
  return rows.map(toDocument)
}

/** Another document in the HOA with the same content, for refusing duplicate uploads. */
export async function findDocumentByHash(db: Database, hoaId: string, sha256: string, excludeId: string) {
  const rows = await db
    .select()
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.sha256, sha256)))
  return rows.map(toDocument).find((document) => document.id !== excludeId) ?? null
}

export async function updateGoverningDocument(
  db: Database,
  hoaId: string,
  id: string,
  patch: Partial<Pick<GoverningDocument, "status" | "error" | "sha256" | "pageCount">>
) {
  await db
    .update(governingDocuments)
    .set(patch)
    .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.id, id)))
}

const sectionKindSchema = z.enum(["body", "definitions", "exhibit"])

function toSection(row: typeof sections.$inferSelect): Section {
  const { hoaId: _hoaId, ...section } = row
  return {
    ...section,
    kind: sectionKindSchema.parse(section.kind),
    references: z.array(z.string()).parse(section.references),
    routing: sectionRoutingSchema.nullable().parse(section.routing ?? null)
  }
}

/** Sections are written once per document version; a second build finds them and writes nothing. */
export async function saveSections(db: Database, hoaId: string, items: readonly Omit<Section, "routing">[]) {
  if (items.length === 0) {
    return
  }
  await db
    .insert(sections)
    .values(items.map((section) => ({ ...section, hoaId, routing: null })))
    .onConflictDoNothing()
}

export async function listSections(db: Database, hoaId: string, documentId: string): Promise<Section[]> {
  const rows = await db
    .select()
    .from(sections)
    .where(and(eq(sections.hoaId, hoaId), eq(sections.documentId, documentId)))
    .orderBy(asc(sections.ordinal))
  return rows.map(toSection)
}

/** The latest routing result, for display; nothing published depends on it. */
export async function setSectionRouting(db: Database, hoaId: string, sectionId: string, routing: Section["routing"]) {
  await db
    .update(sections)
    .set({ routing })
    .where(and(eq(sections.hoaId, hoaId), eq(sections.id, sectionId)))
}
