import { describe, expect, it } from "vitest"
import { applicationFileUrl, opensInBrowser } from "./applicationFile"

describe("applicationFileUrl", () => {
  it("serves a packet file to open, or to save under its own name", () => {
    expect(applicationFileUrl("app 1", "file/2")).toBe("/files/applications/app%201/file%2F2")
    expect(applicationFileUrl("app-1", "f1", { download: true })).toBe("/files/applications/app-1/f1?download")
  })
})

describe("opensInBrowser", () => {
  it("opens PDFs and photos in place, and saves everything else", () => {
    expect(["application/pdf", "image/png", "image/jpeg"].every(opensInBrowser)).toBe(true)
    expect(opensInBrowser("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false)
    expect(opensInBrowser("text/html")).toBe(false)
  })
})
