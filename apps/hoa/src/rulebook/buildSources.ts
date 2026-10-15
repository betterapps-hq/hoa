import type { Database } from "@/db/database"
import { getDocumentStructures, getGoverningDocument } from "@/db/documentRepository"
import { defaultDocumentStructure, uploadEdition, type DocumentStructure } from "@/documents/documentStructure"
import { checkSources, type SourceProblem } from "@/encoding/sourceCheck"
import type { Job } from "@/jobs/job"
import type { Edition } from "@/schema/types"
import { compareCodeUnits } from "./canonical"

// The uploads a build reads, as its check and stages see them, and what the page says when the check refused them.

export type LoadedSource = {
  documentId: string
  title: string
  uploadedBy: string
  structure: DocumentStructure
  edition: Edition
}

/**
 * The ready uploads among these, each with its structure (or its kind's default) and edition, by document key, not
 * upload id: a new version of one document then leaves the others' order, and so the merged vocabulary and every
 * unit's cached context, as they were.
 */
export async function loadBuildSources(db: Database, organizationId: string, documentIds: readonly string[]) {
  const [documents, structures] = await Promise.all([
    Promise.all(documentIds.map((id) => getGoverningDocument(db, organizationId, id))),
    getDocumentStructures(db, organizationId, documentIds)
  ])
  const sources = documents.flatMap((document): LoadedSource[] =>
    document?.status === "ready" && document.sha256 && document.pageCount
      ? [
          {
            documentId: document.id,
            title: document.title,
            uploadedBy: document.uploadedBy,
            structure: structures.get(document.id) ?? defaultDocumentStructure(document.kind),
            edition: uploadEdition({ ...document, sha256: document.sha256, pageCount: document.pageCount })
          }
        ]
      : []
  )
  return sources.toSorted(
    (a, b) => compareCodeUnits(a.structure.key, b.structure.key) || compareCodeUnits(a.documentId, b.documentId)
  )
}

/** Whether a build was refused before it spent anything: it failed its check, which retrying doesn't change. */
export function isRefusedBuild(job: Job | null) {
  return job?.status === "failed" && job.error?.stage === "check" && !job.error.isRetryable
}

/** An upload a build refused, and why, for the page: no developer detail. */
export type RefusedDocument = Pick<SourceProblem, "documentId" | "title" | "kind" | "otherTitle">

// The problem that matters most first: without a readable file nothing else about an upload can be fixed.
const priority: readonly SourceProblem["kind"][] = [
  "file-missing",
  "file-invalid",
  "structure-invalid",
  "duplicate-key"
]

/** One entry per refused upload, in the order they were found, with its most pressing problem. */
export function refusedDocuments(problems: readonly SourceProblem[]): RefusedDocument[] {
  const byDocument = new Map<string, SourceProblem>()
  for (const problem of problems) {
    const held = byDocument.get(problem.documentId)
    if (!held || priority.indexOf(problem.kind) < priority.indexOf(held.kind)) {
      byDocument.set(problem.documentId, problem)
    }
  }
  return [...byDocument.values()].map(({ documentId, title, kind, otherTitle }) =>
    otherTitle === undefined ? { documentId, title, kind } : { documentId, title, kind, otherTitle }
  )
}

/** What the current uploads would be refused for now; empty once they'd pass the check. */
export async function checkCurrentSources(db: Database, organizationId: string, documentIds: readonly string[]) {
  return refusedDocuments(checkSources(await loadBuildSources(db, organizationId, documentIds)))
}
