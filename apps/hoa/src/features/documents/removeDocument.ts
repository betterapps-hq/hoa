import type { Database } from "@/db/database"
import { removeGoverningDocument } from "@/db/documentRepository"
import { getRulebookByStatus } from "@/db/rulebookRepository"
import { assertAdministrator, type RoleId } from "@/features/role/roles"

/**
 * Removes a governing document for an administrator (encoding.md, UX): builds and the documents list leave it out from
 * now on, and the rulebook in force stays as it is until a new one is published. Refused while a build is reading the
 * documents, so a draft never comes from a document that was removed.
 */
export async function removeDocument(
  db: Database,
  context: { hoa: { id: string }; role: RoleId },
  documentId: string,
  now: string
) {
  assertAdministrator(context.role)
  if (await getRulebookByStatus(db, context.hoa.id, "building")) {
    throw new Error("Your documents are being processed. Remove the document once that finishes.")
  }
  if (!(await removeGoverningDocument(db, context.hoa.id, documentId, now))) {
    throw new Error("That document was already removed.")
  }
}
