import type { Database } from "@/db/database"
import { getDocumentStructures, getGoverningDocument } from "@/db/documentRepository"
import { getJob } from "@/db/jobRepository"
import { getRulebook } from "@/db/rulebookRepository"
import { defaultDocumentStructure } from "@/documents/documentStructure"
import { jobOutputPrefix } from "@/storage/keys"
import { buildResultsSince, type BuildResultsPage, type ResultsBucket } from "./buildResults"

/** A document a build reads, so the page can name it and open the reader at a provision of it. */
export type BuildDocument = { key: string; title: string; documentId: string }

export type BuildResults = BuildResultsPage & { documents: BuildDocument[] }

/**
 * The organization's build's results since `since` (encoding.md, UX, Results as they arrive). Only a rulebook build of
 * the asking organization is read: another organization's job id finds nothing.
 */
export async function loadBuildResults(
  db: Database,
  bucket: ResultsBucket,
  hoaId: string,
  input: { jobId: string; since: string | null }
): Promise<BuildResults> {
  const job = await getJob(db, hoaId, input.jobId)
  if (job?.kind !== "rulebook-build") {
    throw new Error("That build isn't one of this organization's.")
  }
  const rulebook = await getRulebook(db, hoaId, job.subjectId)
  const ids = rulebook?.sourceDocumentIds ?? []
  const [uploads, structures, page] = await Promise.all([
    Promise.all(ids.map((id) => getGoverningDocument(db, hoaId, id))),
    getDocumentStructures(db, hoaId, ids),
    buildResultsSince(bucket, jobOutputPrefix(hoaId, job.id), input.since)
  ])
  const documents = uploads.flatMap((upload) => {
    if (!upload) {
      return []
    }
    const structure = structures.get(upload.id) ?? defaultDocumentStructure(upload.kind)
    return [
      { key: structure.key, title: upload.title, documentId: upload.id },
      ...structure.exhibits.map((exhibit) => ({ key: exhibit.key, title: exhibit.title, documentId: upload.id }))
    ]
  })
  return { ...page, documents }
}
