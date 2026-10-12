import { z } from "zod"
import type { Database } from "@/db/database"
import { getDocumentStructures, getGoverningDocument } from "@/db/documentRepository"
import { getJob } from "@/db/jobRepository"
import { getRulebook } from "@/db/rulebookRepository"
import { defaultDocumentStructure } from "@/documents/documentStructure"
import { structureOutput } from "@/encoding/stepOutputs"
import type * as T from "@/schema/types"
import { jobOutputKey, jobOutputPrefix } from "@/storage/keys"
import { buildResultsSince, type BuildResultsPage, type ResultsBucket } from "./buildResults"

/** A document a build reads, as the page's reader shows it: its key, its title and its provisions. */
export type BuildDocument = { key: string; title: string; provisions: T.Provision[] }

/** The organization's rulebook build, or a refusal: another organization's job id, or another kind of job, finds none. */
async function buildOf(db: Database, hoaId: string, jobId: string) {
  const job = await getJob(db, hoaId, jobId)
  if (job?.kind !== "rulebook-build") {
    throw new Error("That build isn't one of this organization's.")
  }
  return job
}

/**
 * The organization's build's results since `since` (encoding.md, UX, Counts as they arrive). Only a rulebook build of
 * the asking organization is read.
 */
export async function loadBuildResults(
  db: Database,
  bucket: ResultsBucket,
  hoaId: string,
  input: { jobId: string; since: string | null }
): Promise<BuildResultsPage> {
  const job = await buildOf(db, hoaId, input.jobId)
  return buildResultsSince(bucket, jobOutputPrefix(hoaId, job.id), input.since)
}

/** A stored output's JSON, or null when it isn't JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The structure step's output, read for its documents only. */
const structured = z.object({ documents: structureOutput.shape.documents })

/**
 * The documents the build reads, with their provisions as its structure step made them, once it has (encoding.md, UX,
 * The build's progress): an upload's documents in the order the step lists them, an exhibit named by its title. None
 * until the step has written them; they don't change after that.
 */
export async function loadBuildDocuments(
  db: Database,
  bucket: Pick<ResultsBucket, "get">,
  hoaId: string,
  jobId: string
): Promise<BuildDocument[]> {
  const job = await buildOf(db, hoaId, jobId)
  const rulebook = await getRulebook(db, hoaId, job.subjectId)
  const ids = rulebook?.sourceDocumentIds ?? []
  const [uploads, structures] = await Promise.all([
    Promise.all(ids.map((id) => getGoverningDocument(db, hoaId, id))),
    getDocumentStructures(db, hoaId, ids)
  ])
  const documents = await Promise.all(
    uploads.map(async (upload) => {
      if (!upload) {
        return []
      }
      const stored = await bucket.get(jobOutputKey(hoaId, job.id, "structure", upload.id))
      const parsed = stored ? structured.safeParse(parseJson(await stored.text())) : null
      if (!parsed?.success) {
        return []
      }
      const structure = structures.get(upload.id) ?? defaultDocumentStructure(upload.kind)
      const titles = new Map<string, string>([
        [structure.key, upload.title],
        ...structure.exhibits.map((exhibit): [string, string] => [exhibit.key, exhibit.title])
      ])
      return parsed.data.documents.map((document) => ({
        key: document.key,
        title: titles.get(document.key) ?? upload.title,
        provisions: document.provisions
      }))
    })
  )
  return documents.flat()
}
