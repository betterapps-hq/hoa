import { defaultDocumentStructure, type DocumentStructure } from "../src/documents/documentStructure.ts"
import type { GoverningDocumentKind } from "../src/documents/governingDocument.ts"

// The sample organization's governing documents as the build reads them (encoding.md, Structure 4): the Declaration,
// whose Exhibit C is the use restrictions, a document of its own, and the Residential Design Guidelines, keyed
// `guidelines`. Shared by the evaluation runner and the script that sets them on local uploads.

export type SampleDocument = {
  /** The upload kind, and the folder of its cached page records under .fixtures/ocr/. */
  kind: GoverningDocumentKind
  fixture: string
  title: string
  effectiveDate: string
  structure: DocumentStructure
}

export const sampleDocuments: SampleDocument[] = [
  {
    kind: "declaration",
    fixture: "declaration",
    title: "Declaration of Covenants, Conditions and Restrictions",
    effectiveDate: "2001-12-04",
    structure: {
      ...defaultDocumentStructure("declaration"),
      exhibits: [
        {
          exhibit: "C",
          key: "use-restrictions",
          kind: "rules",
          title: "Use Restrictions (initially Exhibit C of the Declaration)",
          names: ["Use Restrictions"]
        }
      ]
    }
  },
  {
    kind: "design-guidelines",
    fixture: "design-guidelines",
    title: "Residential Design Guidelines",
    effectiveDate: "2025-11-12",
    structure: defaultDocumentStructure("design-guidelines")
  }
]
