import type { z } from "zod"
import type { Database } from "@/db/database"
import { listGoverningDocuments } from "@/db/documentRepository"
import { insertJob, newJob, updateJob } from "@/db/jobRepository"
import { failRulebook, getRulebook, getRulebookByStatus, insertRulebook } from "@/db/rulebookRepository"
import { currentDocumentIds, isSameDocumentSet } from "@/rulebook/currentDocuments"
import type { rulebookSchema } from "@/rules/rule"
import type { RulebookBuildParams } from "./rulebookBuild.server"

// Requesting a rulebook build (encoding.md, Save draft). Uploads build automatically: DocumentIngest asks for a build
// when a document is ready, RulebookBuild asks again when it ends if the documents changed while it ran, and the
// administrator's "try again" asks directly. Requests coalesce: nothing starts while a document is still being read
// (the last one to finish asks) or while a build runs (it asks again when it ends).

type Rulebook = z.infer<typeof rulebookSchema>

/** The RULEBOOK_BUILD Workflow binding, as far as a request uses it. */
export type RulebookBuildBinding = {
  create: (options: { id: string; params: RulebookBuildParams }) => Promise<unknown>
  /** Rejects when no instance has the id. */
  get: (id: string) => Promise<unknown>
}

/** The ids a build gets: a Workflow step makes them once, so a retried request reuses them. */
export type BuildIds = { rulebookId: string; jobId: string }

export type BuildRequest =
  | ({ status: "started" } & BuildIds)
  | {
      status: "skipped"
      /** A document is still being read, a build is running, no document is ready, or the documents are unchanged. */
      reason: "processing" | "building" | "no-documents" | "unchanged"
    }

export const newBuildIds = (): BuildIds => ({ rulebookId: crypto.randomUUID(), jobId: crypto.randomUUID() })

/** Creates the build's Workflow instance unless a retried request already did. */
async function ensureWorkflow(binding: RulebookBuildBinding, hoaId: string, ids: BuildIds) {
  try {
    await binding.create({ id: ids.jobId, params: { hoaId, rulebookId: ids.rulebookId, jobId: ids.jobId } })
  } catch (error) {
    const existing = await binding.get(ids.jobId).catch(() => null)
    if (!existing) {
      throw error
    }
  }
}

/**
 * Starts a build of the current documents unless one shouldn't start: a document is still being read, a build is
 * running, no document is ready, or the current documents are `unlessCurrentIs`. A request whose rulebook another
 * request inserted first starts nothing. Called again with the same ids after a failure, it starts the workflow the
 * first call inserted the rulebook for, if that's what failed.
 */
export async function requestRulebookBuild(
  db: Database,
  binding: RulebookBuildBinding,
  hoaId: string,
  options: { now: string; ids?: BuildIds; unlessCurrentIs?: readonly string[] }
): Promise<BuildRequest> {
  const ids = options.ids ?? newBuildIds()
  const inserted = await getRulebook(db, hoaId, ids.rulebookId)
  if (inserted) {
    if (inserted.status === "building") {
      await ensureWorkflow(binding, hoaId, ids)
    }
    return { status: "started", ...ids }
  }
  const uploads = await listGoverningDocuments(db, hoaId)
  if (uploads.some((upload) => upload.status === "processing")) {
    return { status: "skipped", reason: "processing" }
  }
  if (await getRulebookByStatus(db, hoaId, "building")) {
    return { status: "skipped", reason: "building" }
  }
  const sourceDocumentIds = currentDocumentIds(uploads)
  if (sourceDocumentIds.length === 0) {
    return { status: "skipped", reason: "no-documents" }
  }
  if (options.unlessCurrentIs && isSameDocumentSet(sourceDocumentIds, options.unlessCurrentIs)) {
    return { status: "skipped", reason: "unchanged" }
  }
  const job = newJob({ id: ids.jobId, hoaId, kind: "rulebook-build", subjectId: ids.rulebookId, now: options.now })
  const rulebook: Rulebook = {
    id: ids.rulebookId,
    hoaId,
    version: null,
    status: "building",
    error: null,
    // The first build's catalog; rulebooks in the rules schema have none. The column goes at cutover (9.6).
    catalogVersion: 0,
    sourceDocumentIds,
    jobId: ids.jobId,
    createdAt: options.now,
    publishedBy: null,
    publishedAt: null
  }
  try {
    await db.batch([insertRulebook(db, rulebook), insertJob(db, job)])
  } catch (error) {
    // The partial unique index refuses a second building rulebook: another request started one first.
    if (await getRulebookByStatus(db, hoaId, "building")) {
      return { status: "skipped", reason: "building" }
    }
    throw error
  }
  await ensureWorkflow(binding, hoaId, ids)
  return { status: "started", ...ids }
}

/** Fails a requested build whose workflow couldn't start, so its rulebook doesn't stay building with nothing running. */
export async function abandonRulebookBuild(db: Database, hoaId: string, ids: BuildIds, message: string, now: string) {
  const error = { stage: "start", message, isRetryable: true }
  await failRulebook(db, hoaId, ids.rulebookId, error)
  await updateJob(db, hoaId, ids.jobId, { status: "failed", error, now })
}
