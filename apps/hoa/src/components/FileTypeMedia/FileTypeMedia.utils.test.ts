import { describe, expect, it } from "vitest"
import { fileTypeOf } from "./FileTypeMedia.utils"

describe("fileTypeOf", () => {
  it("shows a file's extension, colored by its kind", () => {
    expect(fileTypeOf("Fence plan.PDF")).toEqual({ label: "PDF", family: "pdf" })
    expect(fileTypeOf("appendix.docx")).toEqual({ label: "DOCX", family: "word" })
    expect(fileTypeOf("gate.jpeg")).toEqual({ label: "JPEG", family: "image" })
    expect(fileTypeOf("survey.dwg")).toEqual({ label: "DWG", family: "other" })
  })

  it("falls back on the media type for a name without an extension", () => {
    expect(fileTypeOf("scan", "application/pdf")).toEqual({ label: "FILE", family: "pdf" })
    expect(fileTypeOf("photo", "image/png")).toEqual({ label: "FILE", family: "image" })
    expect(fileTypeOf(".hidden")).toEqual({ label: "FILE", family: "other" })
  })
})
