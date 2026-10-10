import type { Database } from "@/db/database"
import { saveBuiltDocuments, type BuiltDocuments } from "@/db/documentRepository"
import { promoteToDraft, saveRulebookContent, type RulebookContent } from "@/db/rulebookContentRepository"
import { getRulebook } from "@/db/rulebookRepository"

// Save draft (encoding.md, 11): the documents the build keyed with their provisions, the draft's records, and the
// rulebook made the organization's draft in place of the one it had. Each write replaces what a retry wrote before.

/** The rulebook isn't building any more (an administrator stopped it), so its build saves nothing. */
export class BuildNotRunningError extends Error {
  constructor(rulebookId: string) {
    super(`The build of rulebook ${rulebookId} was stopped, so its draft isn't saved.`)
    this.name = "BuildNotRunningError"
  }
}

export async function saveBuiltDraft(
  db: Database,
  hoaId: string,
  draft: { rulebookId: string; documents: BuiltDocuments; content: RulebookContent; recordedBy: string; now: string }
) {
  // A build an administrator stopped saves nothing: the documents' provisions and the earlier draft stay as they are.
  // A retry after this rulebook became the draft writes the same again.
  const status = (await getRulebook(db, hoaId, draft.rulebookId))?.status
  if (status !== "building" && status !== "draft") {
    throw new BuildNotRunningError(draft.rulebookId)
  }
  await saveBuiltDocuments(db, hoaId, draft.documents, draft.recordedBy, draft.now)
  await saveRulebookContent(db, hoaId, draft.rulebookId, draft.content)
  await promoteToDraft(db, hoaId, draft.rulebookId)
}
