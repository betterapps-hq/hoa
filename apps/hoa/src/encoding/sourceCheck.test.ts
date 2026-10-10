import { describe, expect, it } from "vitest"
import { uploadEdition } from "@/documents/documentStructure"
import { checkSources, type SourceToCheck } from "./sourceCheck"

const edition = uploadEdition({
  id: "upload-1",
  sha256: "a".repeat(64),
  pageCount: 3,
  effectiveDate: "2024-03-01",
  uploadedAt: "2026-10-09T00:00:00Z"
})

const source = (overrides: Partial<SourceToCheck> = {}): SourceToCheck => ({
  documentId: "upload-1",
  title: "Declaration",
  structure: { key: "declaration", kind: "declaration", names: ["Declaration"], exhibits: [] },
  edition,
  ...overrides
})

describe("checkSources", () => {
  it("passes uploads whose records merge and save", () => {
    expect(checkSources([source()])).toEqual([])
  })

  it("names the document and what's wrong with its edition, structure or key", () => {
    const badFile = { ...edition, files: [{ fileId: "upload-1", sha256: "sample-declaration-pages", pages: 3 }] }
    expect(checkSources([source({ edition: badFile })])).toEqual([
      expect.stringMatching(
        /^The document “Declaration” has a record the build can't save: edition\.files\[0\]\.sha256/
      )
    ])
    expect(checkSources([source({ structure: { ...source().structure, key: "Not A Key" } })])).toEqual([
      expect.stringContaining("has a structure the build can't use: key")
    ])
    expect(checkSources([source(), source({ documentId: "upload-2", title: "Declaration, restated" })])).toEqual([
      "The document “Declaration, restated” has the key declaration, which another document already uses."
    ])
  })
})
