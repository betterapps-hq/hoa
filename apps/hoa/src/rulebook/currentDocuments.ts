import type { GoverningDocument } from "@/documents/governingDocument"
import { compareCodeUnits } from "./canonical"

// The documents a rulebook build reads (encoding.md, Save draft): the latest upload of each document that finished
// reading. An amendment is a document of its own, so it counts beside the document it amends.

/** The ids of the current documents, sorted: for each upload lineage, its highest version that is ready. */
export function currentDocumentIds(uploads: readonly GoverningDocument[]): string[] {
  const latest = new Map<string, GoverningDocument>()
  for (const upload of uploads) {
    const held = latest.get(upload.lineageId)
    if (upload.status === "ready" && (!held || upload.version > held.version)) {
      latest.set(upload.lineageId, upload)
    }
  }
  return [...latest.values()].map((upload) => upload.id).toSorted(compareCodeUnits)
}

/** Whether two lists name the same documents, in any order. */
export function isSameDocumentSet(a: readonly string[], b: readonly string[]) {
  const set = new Set(a)
  return set.size === new Set(b).size && b.every((id) => set.has(id))
}

export type BuildDecision =
  | {
      status: "skipped"
      /** A document is still being read, a build is running, no document is ready, or the documents are unchanged. */
      reason: "processing" | "building" | "no-documents" | "unchanged"
    }
  | { status: "start"; sourceDocumentIds: string[] }

/**
 * Whether a requested build starts, and from which documents. Requests coalesce: nothing starts while a document is
 * still being read (the last one to finish asks again) or while a build runs (it asks again when it ends), and a
 * follow-up request doesn't rebuild the documents a build just read (`unlessCurrentIs`).
 */
export function buildDecision(
  uploads: readonly GoverningDocument[],
  { isBuilding, unlessCurrentIs }: { isBuilding: boolean; unlessCurrentIs?: readonly string[] | undefined }
): BuildDecision {
  if (uploads.some((upload) => upload.status === "processing")) {
    return { status: "skipped", reason: "processing" }
  }
  if (isBuilding) {
    return { status: "skipped", reason: "building" }
  }
  const sourceDocumentIds = currentDocumentIds(uploads)
  if (sourceDocumentIds.length === 0) {
    return { status: "skipped", reason: "no-documents" }
  }
  if (unlessCurrentIs && isSameDocumentSet(sourceDocumentIds, unlessCurrentIs)) {
    return { status: "skipped", reason: "unchanged" }
  }
  return { status: "start", sourceDocumentIds }
}
