import { describe, expect, it } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import { guessDocument } from "./guessDocument"

const document = (id: string, title: string, kind: GoverningDocument["kind"]): GoverningDocument => ({
  id,
  lineageId: id,
  version: 1,
  hoaId: "hoa",
  kind,
  amends: null,
  title,
  effectiveDate: null,
  fileName: `${id}.pdf`,
  mediaType: "application/pdf",
  sizeBytes: 100,
  sha256: null,
  pageCount: 10,
  status: "ready",
  error: null,
  uploadedBy: "admin",
  uploadedAt: "2026-10-08T00:00:00.000Z"
})

const lantern = document("lantern", "Lantern Hollow architectural standards", "design-guidelines")
const covenants = document("covenants", "Declaration of covenants for Quill Ridge", "declaration")
const parking = document("parking", "Parking and quiet hours", "rules-and-regulations")
const documents = [lantern, covenants, parking]

const guess = (fileName: string, among: readonly GoverningDocument[] = documents) =>
  guessDocument(fileName, among)?.id ?? null

describe("guessDocument", () => {
  it("finds the document a file's name names, ignoring case, separators, numbers and the extension", () => {
    expect(guess("LANTERN_HOLLOW-Architectural-Standards_2027_v3.pdf")).toBe("lantern")
    expect(guess("parking-quiet-hours.docx")).toBe("parking")
    expect(guess("LanternHollowStandards.pdf")).toBe("lantern")
  })

  it("tolerates a typo and an abbreviated word", () => {
    expect(guess("lantern holow architectual standards.pdf")).toBe("lantern")
    expect(guess("quill ridge decl.pdf")).toBe("covenants")
  })

  it("matches a document's kind as well as its title", () => {
    expect(guess("CCRs.pdf")).toBe("covenants")
    expect(guess("quill_ridge_cc&rs.pdf", [document("ccrs", "Quill Ridge CC&Rs", "declaration"), parking])).toBe("ccrs")
    expect(guess("rules and regulations.pdf")).toBe("parking")
  })

  it("guesses a new document when the name explains too little or nothing", () => {
    expect(guess("scan0012.pdf")).toBeNull()
    expect(guess("pool heater invoice.pdf")).toBeNull()
    expect(guess("lantern pool heater invoice.pdf")).toBeNull()
    expect(guess("anything.pdf", [])).toBeNull()
  })

  it("prefers the more exact title, and doesn't choose between two equal ones", () => {
    const short = document("short", "Lantern Hollow standards", "design-guidelines")
    expect(guess("lantern hollow standards.pdf", [lantern, short])).toBe("short")
    const twin = document("twin", "Lantern Hollow architectural standards", "design-guidelines")
    expect(guess("lantern hollow standards.pdf", [lantern, twin])).toBeNull()
  })
})
