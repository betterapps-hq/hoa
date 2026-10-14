import { describe, expect, it } from "vitest"
import type { GoverningDocument } from "@/documents/governingDocument"
import { buildDecision, currentDocumentIds, isSameDocumentSet } from "./currentDocuments"

function upload(
  id: string,
  lineageId: string,
  version: number,
  status: GoverningDocument["status"]
): GoverningDocument {
  return {
    id,
    lineageId,
    version,
    organizationId: "hoa-1",
    kind: "declaration",
    amends: null,
    title: id,
    effectiveDate: null,
    fileName: `${id}.pdf`,
    mediaType: "application/pdf",
    sizeBytes: 1,
    sha256: null,
    pageCount: null,
    status,
    error: null,
    uploadedBy: "admin",
    uploadedAt: "2026-10-09T00:00:00Z"
  }
}

describe("currentDocumentIds", () => {
  it("takes each lineage's highest ready version, amendments included, sorted", () => {
    const uploads = [
      upload("d-1", "d", 1, "ready"),
      upload("d-2", "d", 2, "ready"),
      upload("d-3", "d", 3, "failed"),
      upload("b-1", "b", 1, "ready"),
      upload("b-2", "b", 2, "processing"),
      { ...upload("a-1", "a", 1, "ready"), kind: "amendment" as const, amends: "d" },
      upload("c-1", "c", 1, "uploading")
    ]
    expect(currentDocumentIds(uploads)).toEqual(["a-1", "b-1", "d-2"])
    expect(currentDocumentIds([])).toEqual([])
  })
})

describe("isSameDocumentSet", () => {
  it("ignores order", () => {
    expect(isSameDocumentSet(["a", "b"], ["b", "a"])).toBe(true)
    expect(isSameDocumentSet(["a", "b"], ["a"])).toBe(false)
    expect(isSameDocumentSet(["a"], ["b"])).toBe(false)
  })
})

describe("buildDecision", () => {
  const ready = upload("d-1", "d", 1, "ready")
  const restated = upload("d-2", "d", 2, "ready")

  it("builds the current documents once nothing is being read or built", () => {
    expect(buildDecision([], { isBuilding: false })).toEqual({ status: "skipped", reason: "no-documents" })
    expect(buildDecision([ready, upload("d-2", "d", 2, "processing")], { isBuilding: false })).toEqual({
      status: "skipped",
      reason: "processing"
    })
    expect(buildDecision([ready, restated], { isBuilding: true })).toEqual({ status: "skipped", reason: "building" })
    expect(buildDecision([ready, restated], { isBuilding: false })).toEqual({
      status: "start",
      sourceDocumentIds: ["d-2"]
    })
  })

  it("doesn't rebuild the documents a build just read, so a stopped build's follow-up starts nothing", () => {
    expect(buildDecision([ready, restated], { isBuilding: false, unlessCurrentIs: ["d-2"] })).toEqual({
      status: "skipped",
      reason: "unchanged"
    })
    expect(buildDecision([ready, restated], { isBuilding: false, unlessCurrentIs: ["d-1"] })).toEqual({
      status: "start",
      sourceDocumentIds: ["d-2"]
    })
  })
})
