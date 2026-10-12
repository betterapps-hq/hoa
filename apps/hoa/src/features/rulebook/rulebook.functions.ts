import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import type { Database } from "@/db/database"
import { listDocumentProvisions, listDocumentRecords, listGoverningDocuments } from "@/db/documentRepository"
import { getLatestJobOfKind } from "@/db/jobRepository"
import {
  discardDraftRulebook,
  getPublishedRulesFile,
  getRulebookContent,
  type RulebookContent
} from "@/db/rulebookContentRepository"
import { getRulebookByStatus } from "@/db/rulebookRepository"
import type { JobFailure } from "@/jobs/job"
import { readRulesFile, readRulesFileJson } from "@/rulebook/assemble"
import { loadBuildResults, type BuildResults } from "@/rulebook/buildResults.server"
import { checkCurrentSources, isRefusedBuild, type RefusedDocument } from "@/rulebook/buildSources"
import { rulebookChanges, type RulebookChanges } from "@/rulebook/changes"
import { textOutsideProvisions, type SourceText } from "@/rulebook/coverage"
import { currentDocumentIds } from "@/rulebook/currentDocuments"
import { publishBlockers, publishDraft } from "@/rulebook/publish"
import type { rulebookSchema } from "@/rules/rule"
import type * as Rules from "@/schema/types"
import { getRequestContext, requireAdministrator } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { loadPages } from "@/storage/pages"
import { getBucket } from "@/storage/storage.server"
import {
  abandonRulebookBuild,
  newBuildIds,
  requestRulebookBuild,
  stopRulebookBuild as stopBuild,
  type StopResult
} from "@/workflows/rulebookTrigger.server"
import { provisionsBuiltFrom } from "./rulebookRecords"
import { buildFailuresOf, describeBuildProblem } from "./rulebookView"

type Rulebook = z.infer<typeof rulebookSchema>

export type RulebookView = {
  rulebook: Rulebook | null
  /** The rulebook's records; null while it has none. */
  content: RulebookContent | null
  /** The published rules file's SHA-256. */
  fileSha256: string | null
  /**
   * The documents and provisions the published rules file holds, which its rules cite as they were published; null
   * for a draft. The stored ones can change under it: a new upload's build takes over its document's key.
   */
  filedSources: Pick<RulebookSources, "documents" | "provisions"> | null
  /** The latest build, so the page can follow one in progress. */
  buildJobId: string | null
  isBuilding: boolean
  /** Why the latest build failed, when it did; null when it was refused (see `refusedDocuments`). */
  lastBuildError: string | null
  /** What the build that made this rulebook skipped (a rule it couldn't draft, a section it couldn't read). */
  buildFailures: JobFailure[]
  /** Whether building again can get past the latest build's failure, so the page offers to try again. */
  isLastBuildRetryable: boolean
  /** The documents the latest build refused before spending anything, while they still would be; empty otherwise. */
  refusedDocuments: RefusedDocument[]
  /** Whether an administrator stopped the latest build. */
  isLastBuildStopped: boolean
  /** Why the draft can't be published yet. */
  blockers: string[]
  /** What the draft changes against the published rulebook; null for the published view and a draft with no records. */
  changes: RulebookChanges | null
}

/** An upload with pages, which provisions' anchors point into. */
export type SourceFile = { id: string; title: string; pageCount: number }

/** The organization's governing documents and their provisions, which every rulebook's records cite. */
export type RulebookSources = {
  organization: { id: string; name: string }
  documents: Rules.GoverningDocument[]
  provisions: Rules.Provision[]
  /** The document each provision is in, by provision key: a rulebook covers only the documents it was built from. */
  provisionDocumentIds: Record<string, string>
  files: SourceFile[]
}

async function loadSources(db: Database, hoa: { id: string; name: string }): Promise<RulebookSources> {
  const [records, uploads] = await Promise.all([listDocumentRecords(db, hoa.id), listGoverningDocuments(db, hoa.id)])
  const rows = await listDocumentProvisions(
    db,
    hoa.id,
    records.map((record) => record.id)
  )
  return {
    organization: { id: hoa.id, name: hoa.name },
    documents: records.map((record) => record.document),
    provisions: rows.map((row) => row.provision),
    provisionDocumentIds: Object.fromEntries(rows.map((row) => [row.provision.key, row.documentId])),
    files: uploads.flatMap((upload) =>
      upload.status === "ready" && upload.pageCount
        ? [{ id: upload.id, title: upload.title, pageCount: upload.pageCount }]
        : []
    )
  }
}

/** The documents and provisions the rules cite, for every rulebook view. */
export const getRulebookSources = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getRequestContext()
  return loadSources(getDb(), context.hoa)
})

/**
 * The text on each upload's pages that no provision holds (encoding.md, UX, Coverage), cleaned as the structure stage
 * cleans it: only uploads some provision's anchors point into are read.
 */
export const getSourceText = createServerFn({ method: "GET" }).handler(async (): Promise<SourceText[]> => {
  const context = await getRequestContext()
  const sources = await loadSources(getDb(), context.hoa)
  const anchored = new Set(sources.provisions.flatMap((provision) => provision.anchors.map((anchor) => anchor.fileId)))
  const bucket = getBucket()
  return Promise.all(
    sources.files
      .filter((file) => anchored.has(file.id))
      .map(async (file) =>
        textOutsideProvisions(
          file.id,
          await loadPages(bucket, governingKeys(context.hoa.id, file.id), file.pageCount),
          sources.provisions
        )
      )
  )
})

const skippedBuild = {
  processing: "A document is still being read. The rulebook builds when it finishes.",
  building: "A rulebook is already being built.",
  "no-documents": "Upload a governing document first.",
  unchanged: "The rulebook is already built from the current documents."
} as const

/**
 * Builds the rulebook again from the current documents (uploads build it on their own; this is "try again"). Refused
 * while a document is being read or another build runs.
 */
export const startRulebookBuild = createServerFn({ method: "POST" }).handler(async () => {
  const context = await requireAdministrator()
  const db = getDb()
  const hoaId = context.hoa.id
  const ids = newBuildIds()
  const now = new Date().toISOString()
  const request = await requestRulebookBuild(db, bindings.RULEBOOK_BUILD, hoaId, { now, ids }).catch(
    async (error: unknown) => {
      await abandonRulebookBuild(db, hoaId, ids, error instanceof Error ? error.message : String(error), now)
      throw error
    }
  )
  if (request.status === "skipped") {
    throw new Error(skippedBuild[request.reason])
  }
  return { jobId: request.jobId, rulebookId: request.rulebookId }
})

/**
 * Stops the running build (encoding.md, UX): its Workflow ends, nothing is saved or published, and the model answers
 * it finished stay cached for the next build. Says so plainly when the build already ended.
 */
export const stopRulebookBuild = createServerFn({ method: "POST" }).handler(async (): Promise<StopResult> =>
  stopBuild(getDb(), bindings.RULEBOOK_BUILD, await getRequestContext(), new Date().toISOString())
)

/**
 * What the running build has produced so far, since a cursor (encoding.md, UX, Counts as they arrive). The page polls
 * it every few seconds rather than holding a server-sent event stream open for the hour a build takes: each poll lists
 * the build's step outputs and reads only the new ones, and a dropped connection loses nothing.
 */
export const getBuildResults = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ jobId: z.string(), since: z.string().nullable() }).parse(data))
  .handler(async ({ data }): Promise<BuildResults> => {
    const context = await requireAdministrator()
    return loadBuildResults(getDb(), getBucket(), context.hoa.id, data)
  })

/** Deletes the draft rulebook and its records; the published rulebook stays as it is. */
export const discardRulebookDraft = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ rulebookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
    if (draft?.id !== data.rulebookId) {
      throw new Error("That draft is no longer current.")
    }
    await discardDraftRulebook(db, context.hoa.id, draft.id)
  })

/** The draft (administrators) or the published rulebook (everyone), with its records. */
export const getRulebookView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ which: z.enum(["draft", "published"]) }).parse(data))
  .handler(async ({ data }): Promise<RulebookView> => {
    const context = data.which === "draft" ? await requireAdministrator() : await getRequestContext()
    const db = getDb()
    const hoaId = context.hoa.id
    const [building, latestBuild, rulebook] = await Promise.all([
      getRulebookByStatus(db, hoaId, "building"),
      getLatestJobOfKind(db, hoaId, "rulebook-build"),
      getRulebookByStatus(db, hoaId, data.which)
    ])
    const content = rulebook ? await getRulebookContent(db, hoaId, rulebook.id) : null
    const file = data.which === "published" ? await getPublishedRulesFile(db, hoaId) : null
    // A rules file that can't be read leaves the stored documents and provisions standing in; downloading it says why.
    const filed =
      file && file.rulebookId === rulebook?.id ? await readRulesFile(getBucket(), file).catch(() => null) : null
    const review =
      rulebook && data.which === "draft" && content ? await draftReview(db, context.hoa, rulebook, content) : null
    // A refused build is checked again against the documents as they are now, so removing or replacing the one at
    // fault clears it at once.
    const isRefused = isRefusedBuild(latestBuild)
    const refusedDocuments =
      isRefused && data.which === "draft"
        ? await checkCurrentSources(db, hoaId, currentDocumentIds(await listGoverningDocuments(db, hoaId)))
        : []
    return {
      rulebook,
      content,
      fileSha256: file?.rulebookId === rulebook?.id ? (file?.fileSha256 ?? null) : null,
      filedSources: filed ? { documents: filed.documents, provisions: filed.provisions } : null,
      buildJobId: latestBuild?.id ?? null,
      isBuilding: building !== null,
      lastBuildError: isRefused ? null : describeBuildProblem(latestBuild),
      buildFailures: buildFailuresOf(latestBuild, rulebook?.id ?? null),
      isLastBuildRetryable: latestBuild?.status !== "failed" || (latestBuild.error?.isRetryable ?? true),
      refusedDocuments,
      isLastBuildStopped: latestBuild?.status === "cancelled",
      blockers: review?.blockers ?? [],
      changes: review?.changes ?? null
    }
  })

/** Why the draft can't be published yet, and what it changes against the published rulebook. */
async function draftReview(
  db: Database,
  hoa: { id: string; name: string },
  draft: Rulebook,
  content: RulebookContent
): Promise<{ blockers: string[]; changes: RulebookChanges }> {
  const [sources, uploads, published] = await Promise.all([
    loadSources(db, hoa),
    listGoverningDocuments(db, hoa.id),
    getRulebookByStatus(db, hoa.id, "published")
  ])
  const publishedContent = published ? await getRulebookContent(db, hoa.id, published.id) : null
  const changes = await rulebookChanges(
    { ...content, sourceDocumentIds: draft.sourceDocumentIds },
    published && publishedContent ? { ...publishedContent, sourceDocumentIds: published.sourceDocumentIds } : null,
    uploads
  )
  return {
    blockers: publishBlockers({
      ...sources,
      provisions: provisionsBuiltFrom(sources, draft.sourceDocumentIds),
      ...content
    }),
    changes
  }
}

/** Publishes the draft: assembles the rules file, writes it to storage with its hash and supersedes the previous one. */
export const publishRulebook = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ rulebookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
    if (draft?.id !== data.rulebookId) {
      throw new Error("That draft is no longer current.")
    }
    const { version } = await publishDraft(db, getBucket(), context.hoa.id, {
      rulebookId: draft.id,
      userId: context.user.id,
      now: new Date().toISOString()
    })
    return { version }
  })

/** The published rules file exactly as written, for download. */
export const getPublishedRulesFileJson = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getRequestContext()
  const file = await getPublishedRulesFile(getDb(), context.hoa.id)
  if (!file) {
    throw new Error("Nothing is published yet.")
  }
  return readRulesFileJson(getBucket(), file)
})

export type DashboardSummary = {
  hoaName: string
  publishedVersion: number | null
  publishedAt: string | null
  ruleCount: number
  documentTitles: string[]
}

/** The numbers on the dashboard: the published rulebook and the HOA's documents. */
export const getDashboardSummary = createServerFn({ method: "GET" }).handler(async (): Promise<DashboardSummary> => {
  const context = await getRequestContext()
  const db = getDb()
  const published = await getRulebookByStatus(db, context.hoa.id, "published")
  const content = published ? await getRulebookContent(db, context.hoa.id, published.id) : null
  const documents = await listGoverningDocuments(db, context.hoa.id)
  return {
    hoaName: context.hoa.name,
    publishedVersion: published?.version ?? null,
    publishedAt: published?.publishedAt ?? null,
    ruleCount: content?.rules.filter((rule) => rule.review.status === "approved").length ?? 0,
    documentTitles: documents.filter((document) => document.status === "ready").map((document) => document.title)
  }
})
