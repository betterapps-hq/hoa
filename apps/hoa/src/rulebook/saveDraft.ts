import type { Database } from "@/db/database"
import { saveBuiltDocuments, type BuiltDocuments } from "@/db/documentRepository"
import { promoteToDraft, saveRulebookContent, type RulebookContent } from "@/db/rulebookContentRepository"

// Save draft (encoding.md, 11): the documents the build keyed with their provisions, the draft's records, and the
// rulebook made the organization's draft in place of the one it had. Each write replaces what a retry wrote before.

export async function saveBuiltDraft(
  db: Database,
  hoaId: string,
  draft: { rulebookId: string; documents: BuiltDocuments; content: RulebookContent; recordedBy: string; now: string }
) {
  await saveBuiltDocuments(db, hoaId, draft.documents, draft.recordedBy, draft.now)
  await saveRulebookContent(db, hoaId, draft.rulebookId, draft.content)
  await promoteToDraft(db, hoaId, draft.rulebookId)
}
