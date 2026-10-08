import { describe, expect, it } from "vitest"
import { classifyUpload, describeFiles } from "./uploads"

describe("classifyUpload", () => {
  it.each([
    [{ name: "Application.PDF", type: "application/pdf" }, "pdf"],
    [{ name: "scan.pdf", type: "application/octet-stream" }, "pdf"],
    [
      { name: "Appendix A.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      "docx"
    ],
    [{ name: "appendix.docx", type: "" }, "docx"],
    [{ name: "fence.jpg", type: "image/jpeg" }, "image"],
    [{ name: "plot-plan.png", type: "" }, "image"]
  ])("classifies %o as %s", (file, kind) => {
    expect(classifyUpload(file)).toBe(kind)
  })

  it("rejects unsupported files", () => {
    expect(classifyUpload({ name: "notes.txt", type: "text/plain" })).toBeUndefined()
    expect(classifyUpload({ name: "legacy.doc", type: "application/msword" })).toBeUndefined()
  })
})

describe("describeFiles", () => {
  it("numbers the files in upload order", () => {
    expect(describeFiles([{ name: "CC&Rs.pdf" }, { name: "Guidelines.pdf" }])).toBe("1. CC&Rs.pdf; 2. Guidelines.pdf")
  })
})
