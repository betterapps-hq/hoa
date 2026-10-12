import { z } from "zod"
import type { GoverningDocumentKind } from "@/documents/governingDocument"
import type { StructureOptions } from "@/encoding/provisions"
import type { KnownDocument } from "@/encoding/references"
import type { Edition, GoverningDocument } from "@/schema/types"
import { governingDocument } from "@/schema/zod"

// How an uploaded file becomes the rules schema's documents (encoding.md, Structure 4): the key its provisions start
// with, its kind, the names its text calls it by ("this Declaration"), and the exhibits that are documents of their
// own (the sample's Exhibit C, the use restrictions). An administrator sets them per upload; until the rules UX can,
// each upload kind has defaults.

const named = {
  key: governingDocument.shape.key,
  kind: governingDocument.shape.kind,
  names: z.array(z.string().min(1))
}

export const documentStructure = z.object({
  ...named,
  exhibits: z.array(z.object({ exhibit: z.string().min(1), title: z.string().min(1), ...named }))
})
export type DocumentStructure = z.infer<typeof documentStructure>

const defaults: Record<GoverningDocumentKind, Omit<DocumentStructure, "exhibits">> = {
  declaration: { key: "declaration", kind: "declaration", names: ["Declaration"] },
  bylaws: { key: "by-laws", kind: "bylaws", names: ["By-Laws", "Bylaws"] },
  "rules-and-regulations": { key: "rules", kind: "rules", names: ["Rules and Regulations"] },
  "design-guidelines": { key: "guidelines", kind: "design-guidelines", names: ["Design Guidelines", "Guidelines"] },
  amendment: { key: "amendment", kind: "resolution", names: ["Amendment"] },
  form: { key: "form", kind: "policy", names: [] }
}

/** An upload's structure when nobody has set one: its kind's key, kind and names, and no exhibits of their own. */
export function defaultDocumentStructure(kind: GoverningDocumentKind): DocumentStructure {
  return { ...defaults[kind], exhibits: [] }
}

/** The edition an uploaded file holds. */
export function uploadEdition(upload: {
  id: string
  sha256: string
  pageCount: number
  effectiveDate: string | null
  uploadedAt: string
}): Edition {
  const effectiveFrom = upload.effectiveDate ?? upload.uploadedAt.slice(0, 10)
  return {
    label: upload.effectiveDate ? `Effective ${upload.effectiveDate}` : `Uploaded ${effectiveFrom}`,
    adoptedOn: upload.effectiveDate,
    adoptedBy: null,
    effectiveFrom,
    basis: "original",
    files: [{ fileId: upload.id, sha256: upload.sha256, pages: upload.pageCount }],
    recording: null
  }
}

/** The documents an upload becomes: itself, then each exhibit that is a document of its own, with the same edition. */
export function documentsOf(title: string, structure: DocumentStructure, edition: Edition): GoverningDocument[] {
  const document = (key: string, kind: GoverningDocument["kind"], documentTitle: string): GoverningDocument => ({
    key,
    kind,
    title: documentTitle,
    issuedBy: null,
    governs: null,
    edition
  })
  return [
    document(structure.key, structure.kind, title),
    ...structure.exhibits.map((exhibit) => document(exhibit.key, exhibit.kind, exhibit.title))
  ]
}

/** The names the documents' text uses for the upload and its exhibits, for resolving "this Declaration". */
export function knownDocumentsOf(structure: DocumentStructure): KnownDocument[] {
  return [structure, ...structure.exhibits].map(({ key, names }) => ({ key, names }))
}

export function structureOptionsOf(structure: DocumentStructure, fileId: string): StructureOptions {
  return {
    documentKey: structure.key,
    fileId,
    exhibitDocuments: Object.fromEntries(structure.exhibits.map((exhibit) => [exhibit.exhibit, exhibit.key]))
  }
}
