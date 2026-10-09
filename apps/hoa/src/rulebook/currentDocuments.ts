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
