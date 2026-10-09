import { describe, expect, it } from "vitest"
import { contentDisposition, documentFileUrl } from "./documentFile"

describe("document files", () => {
  it("links to the file to open at a page or to save", () => {
    expect(documentFileUrl("doc 1")).toBe("/files/governing/doc%201")
    expect(documentFileUrl("doc-1", { page: 7 })).toBe("/files/governing/doc-1#page=7")
    expect(documentFileUrl("doc-1", { download: true })).toBe("/files/governing/doc-1?download")
  })

  it("names the file with an ASCII fallback and its exact name", () => {
    expect(contentDisposition("attachment", "Guidelines 2025.pdf")).toBe(
      `attachment; filename="Guidelines 2025.pdf"; filename*=UTF-8''Guidelines%202025.pdf`
    )
    expect(contentDisposition("inline", `Règles "final" (1).pdf`)).toBe(
      `inline; filename="R_gles _final_ (1).pdf"; filename*=UTF-8''R%C3%A8gles%20%22final%22%20%281%29.pdf`
    )
  })
})
