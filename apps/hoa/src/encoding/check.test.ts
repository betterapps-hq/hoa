import { describe, expect, it } from "vitest"
import type { Provision } from "@/schema/types"
import { pagesOf, syntheticPages } from "@/tests/syntheticDeclaration"
import { checkStructure } from "./check"
import { cleanPages, type CleanDocument } from "./clean"
import { structureDocument, type StructuredDocument } from "./provisions"

const clean = cleanPages(syntheticPages())
const documents = structureDocument(clean, {
  documentKey: "declaration",
  fileId: "f",
  exhibitDocuments: { A: "rules" }
})

const provision = (
  label: string,
  kind: Provision["kind"],
  normalized: string,
  parentLabel: string | null
): Provision => ({
  key: `doc:${label}`,
  kind,
  num: { printed: normalized, normalized, source: "printed" },
  label,
  heading: null,
  parentLabel,
  intro: null,
  text: "",
  wrapUp: null,
  anchors: [],
  noRule: null
})

const empty: CleanDocument = { lines: [], droppedPages: [] }

describe("checkStructure", () => {
  it("passes a document whose text is covered and whose sequences run", () => {
    expect(checkStructure(clean, documents)).toEqual({ outside: 0, problems: [], needsRepair: false })
  })

  it("sends a document with more than 2 percent of its text outside every provision to repair", () => {
    const partial = documents.map((document) => ({ ...document, provisions: document.provisions.slice(0, 10) }))
    const check = checkStructure(clean, partial)
    expect(check.outside).toBeGreaterThan(0.02)
    expect(check.problems[0]?.code).toBe("uncovered-text")
    expect(check.needsRepair).toBe(true)
  })

  it("finds gaps in numbered sequences, across letters, numerals and numbers", () => {
    const document: StructuredDocument = {
      key: "doc",
      provisions: [
        provision("article-1", "article", "1", null),
        provision("1.1", "section", "1.1", "article-1"),
        provision("1.3", "section", "1.3", "article-1"),
        provision("1.1(a)", "point", "a", "1.1"),
        provision("1.1(b)", "point", "b", "1.1"),
        provision("1.1(b)(i)", "point", "i", "1.1(b)"),
        provision("1.1(b)(ii)", "point", "ii", "1.1(b)")
      ]
    }
    expect(checkStructure(empty, [document]).problems).toEqual([
      { code: "broken-sequence", message: "the sections under doc:article-1 skip a number", key: "doc:article-1" }
    ])
  })

  it("reports repeated keys and numbers code repaired", () => {
    const repaired = {
      ...provision("1.2", "section", "1.2", "article-1"),
      num: { printed: "2.2", normalized: "1.2", source: "inferred" as const }
    }
    const document: StructuredDocument = {
      key: "doc",
      provisions: [
        provision("article-1", "article", "1", null),
        provision("1.1", "section", "1.1", "article-1"),
        repaired,
        repaired
      ]
    }
    const check = checkStructure(empty, [document])
    expect(check.problems.map((problem) => problem.code)).toEqual([
      "broken-sequence",
      "inferred-number",
      "duplicate-key",
      "inferred-number"
    ])
    expect(check.needsRepair).toBe(true)
  })
})

describe("checkStructure on provision size", () => {
  const checked = (text: string) => {
    const cleaned = cleanPages(pagesOf([{ text }]))
    return checkStructure(cleaned, structureDocument(cleaned, { documentKey: "covenants", fileId: "f" }))
  }
  const long = Array.from({ length: 1100 }, (_, index) => `word${index}`).join(" ")

  it("sends a provision too long to be one to repair: the parser missed the numbering under it", () => {
    const result = checked(`# COVENANTS\n\nARTICLE 1 USE\n\n1.1 Homes. ${long}.`)
    expect(result.problems.map((problem) => problem.code)).toContain("oversized-provision")
    expect(result.needsRepair).toBe(true)
  })

  it("passes provisions of an ordinary size", () => {
    expect(
      checked("# COVENANTS\n\nARTICLE 1 USE\n\n1.1 Homes. Lots are for homes.\n\n1.2 Signs. No signs.").problems
    ).toEqual([])
  })
})
