import { and, asc, eq, inArray, isNotNull, like, max, notInArray, or } from "drizzle-orm"
import { z } from "zod"
import { documentStructure, type DocumentStructure } from "@/documents/documentStructure"
import {
  governingDocumentSchema,
  sectionRoutingSchema,
  type GoverningDocument,
  type Section
} from "@/documents/governingDocument"
import type * as Rules from "@/schema/types"
import { governingDocument, provision as provisionSchema } from "@/schema/zod"
import { insertChunks, runBatch } from "./batching"
import type { Database } from "./database"
import { governingDocuments, provisions, sections } from "./schema"

function toDocument(row: typeof governingDocuments.$inferSelect): GoverningDocument {
  return governingDocumentSchema.parse(row)
}

// Uploads: the rows with a file. Documents the rules name without a file are read as DocumentRecords below.
const hasFile = isNotNull(governingDocuments.fileName)

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
    .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.id, id), hasFile))
    .get()
  return row ? toDocument(row) : null
}

export async function listGoverningDocuments(db: Database, hoaId: string) {
  const rows = await db
    .select()
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, hoaId), hasFile))
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

/**
 * Sections are written once per document version; a second build finds them and writes nothing. One statement per row,
 * in a batch: D1 allows 100 bound parameters per statement, so a multi-row insert of a long document fails.
 */
export async function saveSections(db: Database, hoaId: string, items: readonly Omit<Section, "routing">[]) {
  const [first, ...rest] = items.map((section) =>
    db
      .insert(sections)
      .values({ ...section, hoaId, routing: null })
      .onConflictDoNothing()
  )
  if (first) {
    await db.batch([first, ...rest])
  }
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

// ─── The rules schema's documents and provisions (encoding.md, Storage) ──────────────────────────

/** A governing document as the rules schema sees it, with the id of its row. */
export type DocumentRecord = { id: string; document: Rules.GoverningDocument }

/**
 * The row for a document without a file: one the rules name that nobody uploaded (`referenced`), or one whose text
 * came from a rules file rather than an upload (`ready`).
 */
export function fileLessDocumentRow(
  hoaId: string,
  { id, document }: DocumentRecord,
  recordedBy: string,
  recordedAt: string
): typeof governingDocuments.$inferInsert {
  return {
    id,
    hoaId,
    lineageId: id,
    version: 1,
    kind: document.kind,
    amends: null,
    title: document.title,
    effectiveDate: document.edition?.effectiveFrom ?? null,
    fileName: null,
    mediaType: null,
    sizeBytes: null,
    sha256: null,
    pageCount: null,
    status: document.edition ? "ready" : "referenced",
    error: null,
    uploadedBy: recordedBy,
    uploadedAt: recordedAt,
    key: document.key,
    document
  }
}

/** Records documents the rules name that nobody uploaded. Saving one again updates it. */
export async function saveReferencedDocuments(
  db: Database,
  hoaId: string,
  records: readonly DocumentRecord[],
  recordedBy: string,
  recordedAt: string
) {
  await runBatch(
    db,
    records.map((record) => {
      const row = fileLessDocumentRow(
        hoaId,
        { id: record.id, document: governingDocument.parse(record.document) },
        recordedBy,
        recordedAt
      )
      const { kind, title, effectiveDate, status, key, document } = row
      return db.insert(governingDocuments).values(row).onConflictDoUpdate({
        target: governingDocuments.id,
        set: { kind, title, effectiveDate, status, key, document }
      })
    })
  )
}

/** The organization's documents in the rules schema, by key: the uploads a build has keyed, and the referenced. */
export async function listDocumentRecords(db: Database, hoaId: string): Promise<DocumentRecord[]> {
  const rows = await db
    .select({ id: governingDocuments.id, document: governingDocuments.document })
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, hoaId), isNotNull(governingDocuments.document)))
    .orderBy(asc(governingDocuments.key))
  return rows.map((row) => ({ id: row.id, document: governingDocument.parse(row.document) }))
}

/** A document's provisions as rows, in document order. A provision key starts with its document's key. */
export function provisionRows(
  hoaId: string,
  documentId: string,
  items: readonly Rules.Provision[]
): (typeof provisions.$inferInsert)[] {
  return items.map((provision, ordinal) => ({
    hoaId,
    documentId,
    key: provision.key,
    label: provision.label,
    parentKey:
      provision.parentLabel === null
        ? null
        : `${provision.key.slice(0, provision.key.indexOf(":"))}:${provision.parentLabel}`,
    kind: provision.kind,
    ordinal,
    provision
  }))
}

/** Replaces a document's provisions in one batch, so a retried structure step writes them once. */
export async function saveProvisions(
  db: Database,
  hoaId: string,
  documentId: string,
  items: readonly Rules.Provision[]
) {
  const rows = provisionRows(
    hoaId,
    documentId,
    items.map((item) => provisionSchema.parse(item))
  )
  await runBatch(db, [
    db.delete(provisions).where(and(eq(provisions.hoaId, hoaId), eq(provisions.documentId, documentId))),
    ...insertChunks(provisions, rows).map((group) => db.insert(provisions).values(group))
  ])
}

/** The documents' provisions, each document's in order. */
export async function listProvisions(
  db: Database,
  hoaId: string,
  documentIds: readonly string[]
): Promise<Rules.Provision[]> {
  if (documentIds.length === 0) {
    return []
  }
  const rows = await db
    .select({ provision: provisions.provision })
    .from(provisions)
    .where(and(eq(provisions.hoaId, hoaId), inArray(provisions.documentId, [...documentIds])))
    .orderBy(asc(provisions.documentId), asc(provisions.ordinal))
  return rows.map((row) => provisionSchema.parse(row.provision))
}

export async function getProvision(db: Database, hoaId: string, key: string): Promise<Rules.Provision | null> {
  const row = await db
    .select({ provision: provisions.provision })
    .from(provisions)
    .where(and(eq(provisions.hoaId, hoaId), eq(provisions.key, key)))
    .get()
  return row ? provisionSchema.parse(row.provision) : null
}

// ─── What a build writes (encoding.md, Save draft) ──────────────────────────────────────────────

/** The structures set for uploads, by id; an upload without one is missing. */
export async function getDocumentStructures(db: Database, hoaId: string, ids: readonly string[]) {
  if (ids.length === 0) {
    return new Map<string, DocumentStructure>()
  }
  const rows = await db
    .select({ id: governingDocuments.id, structure: governingDocuments.structure })
    .from(governingDocuments)
    .where(and(eq(governingDocuments.hoaId, hoaId), inArray(governingDocuments.id, [...ids])))
  return new Map(rows.flatMap((row) => (row.structure ? [[row.id, documentStructure.parse(row.structure)]] : [])))
}

/** Sets how builds structure an upload. */
export async function setDocumentStructure(db: Database, hoaId: string, id: string, structure: DocumentStructure) {
  await db
    .update(governingDocuments)
    .set({ structure: documentStructure.parse(structure) })
    .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.id, id)))
}

/** The documents a build read: each upload's own documents (itself first, then its exhibits) with their provisions. */
export type BuiltDocuments = {
  uploads: { documentId: string; documents: { document: Rules.GoverningDocument; provisions: Rules.Provision[] }[] }[]
  /** Documents the text names that nobody uploaded. */
  referenced: Rules.GoverningDocument[]
}

/**
 * Keys the uploads and writes their provisions, the exhibits that are documents of their own and the documents the
 * text names, in one batch. A document of the organization that held one of these keys gives it up, with its
 * provisions. Builds write these ids again on every run, so a retried step writes them once.
 */
export async function saveBuiltDocuments(
  db: Database,
  hoaId: string,
  built: BuiltDocuments,
  recordedBy: string,
  recordedAt: string
) {
  const fileLessId = (key: string) => `${hoaId}:${key}`
  const records = [
    ...built.uploads.flatMap(({ documentId, documents }) =>
      documents.map(({ document, provisions: items }, index) => ({
        id: index === 0 ? documentId : fileLessId(document.key),
        isUpload: index === 0,
        document: governingDocument.parse(document),
        provisions: items
      }))
    ),
    ...built.referenced.map((document) => ({
      id: fileLessId(document.key),
      isUpload: false,
      document: governingDocument.parse(document),
      provisions: []
    }))
  ]
  const keys = records.map((record) => record.document.key)
  const ids = records.map((record) => record.id)
  if (records.length === 0) {
    return
  }
  await runBatch(db, [
    db
      .update(governingDocuments)
      .set({ key: null, document: null })
      .where(
        and(
          eq(governingDocuments.hoaId, hoaId),
          inArray(governingDocuments.key, keys),
          notInArray(governingDocuments.id, ids)
        )
      ),
    db
      .delete(provisions)
      .where(and(eq(provisions.hoaId, hoaId), or(...keys.map((key) => like(provisions.key, `${key}:%`))))),
    ...records.map((record) => {
      if (record.isUpload) {
        return db
          .update(governingDocuments)
          .set({ key: record.document.key, document: record.document })
          .where(and(eq(governingDocuments.hoaId, hoaId), eq(governingDocuments.id, record.id)))
      }
      const row = fileLessDocumentRow(hoaId, record, recordedBy, recordedAt)
      const { kind, title, effectiveDate, status, key, document } = row
      return db.insert(governingDocuments).values(row).onConflictDoUpdate({
        target: governingDocuments.id,
        set: { kind, title, effectiveDate, status, key, document }
      })
    }),
    ...records.flatMap((record) =>
      insertChunks(
        provisions,
        provisionRows(
          hoaId,
          record.id,
          record.provisions.map((item) => provisionSchema.parse(item))
        )
      ).map((group) => db.insert(provisions).values(group))
    )
  ])
}
