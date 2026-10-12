import { describe, expect, it } from "vitest"
import { uploadEdition } from "@/documents/documentStructure"
import { checkSources, SourcesRejectedError, type SourceToCheck } from "./sourceCheck"

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

  it("maps each issue to a kind of problem, with the schema's words kept for developers", () => {
    const badFile = { ...edition, files: [{ fileId: "upload-1", sha256: "sample-declaration-pages", pages: 3 }] }
    expect(checkSources([source({ edition: badFile })])).toEqual([
      {
        documentId: "upload-1",
        title: "Declaration",
        kind: "file-invalid",
        detail: expect.stringContaining("edition.files[0].sha256")
      }
    ])
    const noHash = { ...edition, files: [{ fileId: "upload-1", sha256: "", pages: 3 }] }
    expect(checkSources([source({ edition: noHash })])).toEqual([expect.objectContaining({ kind: "file-missing" })])
    expect(checkSources([source({ structure: { ...source().structure, key: "Not A Key" } })])).toEqual([
      expect.objectContaining({ kind: "structure-invalid", detail: expect.stringContaining("structure.key") })
    ])
    expect(checkSources([source({ title: "" })])).toEqual([expect.objectContaining({ kind: "structure-invalid" })])
  })

  it("names the other document when two share a key", () => {
    expect(checkSources([source(), source({ documentId: "upload-2", title: "Declaration, restated" })])).toEqual([
      {
        documentId: "upload-2",
        title: "Declaration, restated",
        kind: "duplicate-key",
        otherTitle: "Declaration",
        detail: expect.stringContaining("declaration")
      }
    ])
  })

  it("refuses with the developer detail in its message", () => {
    const noHash = { ...edition, files: [{ fileId: "upload-1", sha256: "", pages: 3 }] }
    const [problem] = checkSources([source({ edition: noHash })])
    const error = new SourcesRejectedError(problem ? [problem] : [])
    expect(error.message).toMatch(/upload-1 \(file-missing\) document declaration, edition\.files/)
    expect(error.problems).toHaveLength(1)
  })
})
