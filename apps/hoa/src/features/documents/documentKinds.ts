import type { GoverningDocument } from "@/documents/governingDocument"

// How the documents list names an upload's kind and status.

export const documentKindLabels: Record<GoverningDocument["kind"], string> = {
  declaration: "Declaration (CC&Rs)",
  bylaws: "Bylaws",
  "rules-and-regulations": "Rules and regulations",
  "design-guidelines": "Design guidelines",
  amendment: "Amendment",
  form: "Form or checklist"
}

/** The uploads as the documents list shows them: each document's latest version, with its earlier ones, newest first. */
export function documentVersions(uploads: readonly GoverningDocument[]) {
  const byLineage = Map.groupBy(uploads, (upload) => upload.lineageId)
  return [...byLineage.values()].flatMap((versions) => {
    const [latest, ...earlier] = versions.toSorted((a, b) => b.version - a.version)
    return latest ? [{ latest, earlier }] : []
  })
}
