import type { GoverningDocument } from "@/documents/governingDocument"
import { currentDocumentIds, isSameDocumentSet } from "@/rulebook/currentDocuments"
import type { RulebookView } from "../rulebook.functions"

// What the rulebook page says first (encoding.md, UX): the one thing that's happening or next, in a sentence, with at
// most one action.

export type RulebookStatus =
  | { kind: "building"; reading: string[] }
  | { kind: "reading"; reading: string[] }
  | { kind: "draft-ready"; isFirst: boolean; summary: string; builtFrom: string[] }
  | { kind: "build-failed"; error: string }
  | { kind: "build-stopped"; hasDraft: boolean }
  | { kind: "documents-changed"; version: number | null }
  | { kind: "not-built" }
  | { kind: "none" }

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "adds 5 rules, changes 12 and removes 2": what a draft does to the rules, or null when it leaves them alone. */
export function changeSummary(changes: NonNullable<RulebookView["changes"]>) {
  const parts = [
    changes.rules.added.length > 0 ? `adds ${counted(changes.rules.added.length, "rule", "rules")}` : null,
    changes.rules.changed.length > 0 ? `changes ${counted(changes.rules.changed.length, "rule", "rules")}` : null,
    changes.rules.removed.length > 0 ? `removes ${counted(changes.rules.removed.length, "rule", "rules")}` : null
  ].filter((part) => part !== null)
  if (parts.length === 0) {
    const terms = changes.terms.added.length + changes.terms.changed.length + changes.terms.removed.length
    return terms > 0 ? `changes ${counted(terms, "term", "terms")} and no rules` : null
  }
  return parts.length === 1 ? (parts[0] ?? null) : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/** The page's state for an administrator, most pressing first. */
export function rulebookStatus({
  draft,
  published,
  uploads
}: {
  draft: RulebookView
  published: RulebookView
  uploads: GoverningDocument[]
}): RulebookStatus {
  const reading = uploads.filter((upload) => upload.status === "processing").map((upload) => upload.title)
  if (draft.isBuilding) {
    return { kind: "building", reading }
  }
  if (reading.length > 0) {
    return { kind: "reading", reading }
  }
  if (draft.isLastBuildStopped) {
    return { kind: "build-stopped", hasDraft: draft.rulebook !== null && draft.content !== null }
  }
  if (draft.rulebook && draft.content) {
    const changes = draft.changes
    return {
      kind: "draft-ready",
      isFirst: changes?.isFirst ?? published.rulebook === null,
      summary: changes ? (changeSummary(changes) ?? "") : "",
      builtFrom: changes?.documents.added.map((document) => document.title) ?? []
    }
  }
  if (draft.lastBuildError) {
    return { kind: "build-failed", error: draft.lastBuildError }
  }
  const current = currentDocumentIds(uploads)
  if (current.length === 0) {
    return { kind: "none" }
  }
  if (!published.rulebook) {
    return { kind: "not-built" }
  }
  return isSameDocumentSet(current, published.rulebook.sourceDocumentIds)
    ? { kind: "none" }
    : { kind: "documents-changed", version: published.rulebook.version }
}
