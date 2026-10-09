import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import type { Database } from "@/db/database"
import {
  getGoverningDocument,
  listDocumentRecords,
  listGoverningDocuments,
  listProvisions
} from "@/db/documentRepository"
import { getLatestJobOfKind, insertJob, newJob } from "@/db/jobRepository"
import { getPublishedRulesFile, getRulebookContent, type RulebookContent } from "@/db/rulebookContentRepository"
import { getRulebookByStatus, insertRulebook } from "@/db/rulebookRepository"
import { readRulesFileJson } from "@/rulebook/assemble"
import { textOutsideProvisions, type SourceText } from "@/rulebook/coverage"
import { publishBlockers, publishDraft } from "@/rulebook/publish"
import type { rulebookSchema } from "@/rules/rule"
import type * as Rules from "@/schema/types"
import { getRequestContext, requireAdministrator } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"
import { loadPages } from "@/workflows/ocrSteps.server"
import { describeBuildProblem } from "./rulebookView"

type Rulebook = z.infer<typeof rulebookSchema>

export type RulebookView = {
  rulebook: Rulebook | null
  /** The rulebook's records; null while it has none. */
  content: RulebookContent | null
  /** The published rules file's SHA-256. */
  fileSha256: string | null
  /** The latest build, so the page can follow one in progress. */
  buildJobId: string | null
  isBuilding: boolean
  /** Why the latest build failed or skipped items, when it did. */
  lastBuildError: string | null
  /** Why the draft can't be published yet. */
  blockers: string[]
}

/** An upload with pages, which provisions' anchors point into. */
export type SourceFile = { id: string; title: string; pageCount: number }

/** The organization's governing documents and their provisions, which every rulebook's records cite. */
export type RulebookSources = {
  organization: { id: string; name: string }
  documents: Rules.GoverningDocument[]
  provisions: Rules.Provision[]
  files: SourceFile[]
}

async function loadSources(db: Database, hoa: { id: string; name: string }): Promise<RulebookSources> {
  const [records, uploads] = await Promise.all([listDocumentRecords(db, hoa.id), listGoverningDocuments(db, hoa.id)])
  return {
    organization: { id: hoa.id, name: hoa.name },
    documents: records.map((record) => record.document),
    provisions: await listProvisions(
      db,
      hoa.id,
      records.map((record) => record.id)
    ),
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

/** Starts a rulebook build from ready documents; refused while another build runs. */
export const startRulebookBuild = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ documentIds: z.array(z.string()).min(1, "Choose at least one document.") }).parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const hoaId = context.hoa.id
    if (await getRulebookByStatus(db, hoaId, "building")) {
      throw new Error("A rulebook is already being built.")
    }
    const documents = await Promise.all(data.documentIds.map((id) => getGoverningDocument(db, hoaId, id)))
    if (documents.some((document) => document?.status !== "ready")) {
      throw new Error("Every document must finish reading before the rulebook is built.")
    }
    const now = new Date().toISOString()
    const job = newJob({ hoaId, kind: "rulebook-build", subjectId: crypto.randomUUID(), now })
    const rulebook: Rulebook = {
      id: job.subjectId,
      hoaId,
      version: null,
      status: "building",
      error: null,
      // The first build's catalog; rulebooks in the rules schema have none. The column goes at cutover (9.6).
      catalogVersion: 0,
      sourceDocumentIds: data.documentIds,
      jobId: job.id,
      createdAt: now,
      publishedBy: null,
      publishedAt: null
    }
    // The partial unique index refuses a second building rulebook, so a double click can't start two builds.
    await db.batch([insertRulebook(db, rulebook), insertJob(db, job)])
    await bindings.RULEBOOK_BUILD.create({ id: job.id, params: { hoaId, rulebookId: rulebook.id, jobId: job.id } })
    return { jobId: job.id, rulebookId: rulebook.id }
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
    const blockers =
      data.which === "draft" && content ? publishBlockers({ ...(await loadSources(db, context.hoa)), ...content }) : []
    return {
      rulebook,
      content,
      fileSha256: file?.rulebookId === rulebook?.id ? (file?.fileSha256 ?? null) : null,
      buildJobId: latestBuild?.id ?? null,
      isBuilding: building !== null,
      lastBuildError: describeBuildProblem(latestBuild),
      blockers
    }
  })

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
