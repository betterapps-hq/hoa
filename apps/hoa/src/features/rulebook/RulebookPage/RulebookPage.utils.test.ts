import { describe, expect, it } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import { sampleRecords } from "@/tests/rulebookWorkspace"
import type { RulebookView } from "../rulebook.functions"
import { changeSummary, rulebookStatus } from "./RulebookPage.utils"

const upload = (id: string, overrides: Partial<GoverningDocument> = {}): GoverningDocument => ({
  id,
  lineageId: id,
  version: 1,
  hoaId: "hoa",
  kind: "declaration",
  amends: null,
  title: `Document ${id}`,
  effectiveDate: null,
  fileName: `${id}.pdf`,
  mediaType: "application/pdf",
  sizeBytes: 1,
  sha256: "x",
  pageCount: 3,
  status: "ready",
  error: null,
  uploadedBy: "admin",
  uploadedAt: "",
  ...overrides
})

const rulebook = (status: "draft" | "published", sourceDocumentIds: string[]) => ({
  id: status,
  hoaId: "hoa",
  version: status === "published" ? 2 : null,
  status,
  error: null,
  catalogVersion: 0,
  sourceDocumentIds,
  jobId: "job",
  createdAt: "",
  publishedBy: null,
  publishedAt: null
})

const view = (overrides: Partial<RulebookView> = {}): RulebookView => ({
  rulebook: null,
  content: null,
  fileSha256: null,
  buildJobId: null,
  isBuilding: false,
  lastBuildError: null,
  isLastBuildStopped: false,
  blockers: [],
  changes: null,
  ...overrides
})

const changes = (rules: { added?: number; changed?: number; removed?: number }, terms = 0) => ({
  isFirst: false,
  rules: {
    added: Array.from({ length: rules.added ?? 0 }, (_, index) => `a${index}`),
    changed: Array.from({ length: rules.changed ?? 0 }, (_, index) => `c${index}`),
    removed: []
  },
  terms: { added: Array.from({ length: terms }, (_, index) => `t${index}`), changed: [], removed: [] },
  settingsChanged: false,
  documents: { added: [], removed: [] }
})

describe("rulebookStatus", () => {
  const published = view({ rulebook: rulebook("published", ["a"]) })

  it("follows a build first, then documents being read", () => {
    expect(rulebookStatus({ draft: view({ isBuilding: true }), published, uploads: [] }).kind).toBe("building")
    expect(
      rulebookStatus({ draft: view(), published, uploads: [upload("a"), upload("b", { status: "processing" })] })
    ).toEqual({ kind: "reading", reading: ["Document b"] })
  })

  it("says what a ready draft changes", () => {
    const draft = view({
      rulebook: rulebook("draft", ["a", "b"]),
      content: {
        rules: [],
        terms: [],
        questions: [],
        settings: sampleRecords().settings,
        coverage: { provisions: 0, uncovered: [] }
      },
      changes: changes({ added: 2, changed: 1 })
    })
    expect(rulebookStatus({ draft, published, uploads: [upload("a"), upload("b")] })).toMatchObject({
      kind: "draft-ready",
      isFirst: false,
      summary: "adds 2 rules and changes 1 rule"
    })
  })

  it("offers a build when the documents differ from the published ones, and nothing when they don't", () => {
    expect(rulebookStatus({ draft: view(), published, uploads: [upload("a"), upload("b")] })).toEqual({
      kind: "documents-changed",
      version: 2
    })
    expect(rulebookStatus({ draft: view(), published, uploads: [upload("a")] }).kind).toBe("none")
    expect(rulebookStatus({ draft: view(), published: view(), uploads: [upload("a")] }).kind).toBe("not-built")
    expect(rulebookStatus({ draft: view({ lastBuildError: "Failed." }), published, uploads: [] }).kind).toBe(
      "build-failed"
    )
  })
})

describe("changeSummary", () => {
  it("words what a draft does to the rules", () => {
    expect(changeSummary(changes({ added: 1, changed: 12, removed: 0 }))).toBe("adds 1 rule and changes 12 rules")
    expect(changeSummary(changes({}, 3))).toBe("changes 3 terms and no rules")
    expect(changeSummary(changes({}))).toBeNull()
  })
})
