import { describe, expect, it } from "vitest"
import {
  defaultDocumentStructure,
  documentStructure,
  documentsOf,
  knownDocumentsOf,
  structureOptionsOf,
  uploadEdition
} from "./documentStructure"

const declaration = {
  ...defaultDocumentStructure("declaration"),
  exhibits: [
    {
      exhibit: "C",
      key: "conduct-rules",
      kind: "rules" as const,
      title: "Rules of Conduct",
      names: ["Rules of Conduct"]
    }
  ]
}
const upload = {
  id: "upload-1",
  sha256: "a".repeat(64),
  pageCount: 80,
  effectiveDate: null,
  uploadedAt: "2026-10-09T08:00:00Z"
}

describe("document structure", () => {
  it("defaults each upload kind to a key, a kind and the names its text uses", () => {
    expect(defaultDocumentStructure("design-guidelines")).toEqual({
      key: "guidelines",
      kind: "design-guidelines",
      names: ["Design Guidelines", "Guidelines"],
      exhibits: []
    })
    expect(defaultDocumentStructure("rules-and-regulations")).toMatchObject({ key: "rules", kind: "rules" })
    expect(documentStructure.safeParse({ ...declaration, key: "Not A Key" }).success).toBe(false)
  })

  it("gives an upload's edition its effective date, or the upload date", () => {
    expect(uploadEdition(upload)).toMatchObject({
      label: "Uploaded 2026-10-09",
      adoptedOn: null,
      effectiveFrom: "2026-10-09",
      files: [{ fileId: "upload-1", sha256: "a".repeat(64), pages: 80 }]
    })
    expect(uploadEdition({ ...upload, effectiveDate: "2001-12-04" })).toMatchObject({
      label: "Effective 2001-12-04",
      adoptedOn: "2001-12-04",
      effectiveFrom: "2001-12-04"
    })
  })

  it("makes an upload its own document and each marked exhibit another, with the same edition", () => {
    const edition = uploadEdition(upload)
    expect(documentsOf("Declaration", declaration, edition)).toEqual([
      { key: "declaration", kind: "declaration", title: "Declaration", issuedBy: null, governs: null, edition },
      { key: "conduct-rules", kind: "rules", title: "Rules of Conduct", issuedBy: null, governs: null, edition }
    ])
    expect(knownDocumentsOf(declaration)).toEqual([
      { key: "declaration", names: ["Declaration"] },
      { key: "conduct-rules", names: ["Rules of Conduct"] }
    ])
    expect(structureOptionsOf(declaration, "upload-1")).toEqual({
      documentKey: "declaration",
      fileId: "upload-1",
      exhibitDocuments: { C: "conduct-rules" }
    })
  })
})
