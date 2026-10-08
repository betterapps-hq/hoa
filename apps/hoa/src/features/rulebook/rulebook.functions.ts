import { createServerFn } from "@tanstack/react-start"
import { env as bindings } from "cloudflare:workers"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import { getGoverningDocument, listGoverningDocuments } from "@/db/documentRepository"
import { getLatestJobOfKind, insertJob, newJob } from "@/db/jobRepository"
import {
  copyRulebookAsDraft,
  deleteRule,
  discardDraft,
  getRule,
  getRulebookByStatus,
  insertRulebook,
  listRules,
  publishRulebook as publishRulebookRecord,
  updateRule,
  updateRules
} from "@/db/rulebookRepository"
import { pageSchema } from "@/ocr/page"
import type { RemovedRule } from "@/pipeline/carryForward"
import { catalogVersion } from "@/rules/catalog"
import { ruleSchema, rulebookSchema, type Rule } from "@/rules/rule"
import { getRequestContext, requireAdministrator } from "@/session/requestContext.server"
import { governingKeys, jobOutputKey } from "@/storage/keys"
import { getJson } from "@/storage/objects"
import { getBucket } from "@/storage/storage.server"
import {
  addCitation,
  applyRuleChanges,
  approvalBlocker,
  citationFromSelection,
  describeBuildProblem,
  publishBlockers,
  readyToApprove,
  removeCitation,
  replaceCitation,
  ruleChangesSchema
} from "./rulebookEditing"

type Rulebook = z.infer<typeof rulebookSchema>

export type RulebookView = {
  rulebook: Rulebook | null
  rules: Rule[]
  /** For a draft: rules from the previous version that the new build no longer produced. */
  removed: RemovedRule[]
  /** The latest build, so the page can follow one in progress. */
  buildJobId: string | null
  isBuilding: boolean
  /** Why the latest build failed or skipped sections, when it did. */
  lastBuildError: string | null
  blockers: string[]
}

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
      catalogVersion,
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

const removedSchema = z.array(ruleSchema.pick({ ruleKey: true, title: true, citations: true }))

/** The draft (administrators) or the published rulebook (everyone), with what the editor needs. */
export const getRulebookView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ which: z.enum(["draft", "published"]) }).parse(data))
  .handler(async ({ data }): Promise<RulebookView> => {
    const context = data.which === "draft" ? await requireAdministrator() : await getRequestContext()
    const db = getDb()
    const hoaId = context.hoa.id
    const building = await getRulebookByStatus(db, hoaId, "building")
    const latestBuild = await getLatestJobOfKind(db, hoaId, "rulebook-build")
    const rulebook = await getRulebookByStatus(db, hoaId, data.which)
    const rules = rulebook ? await listRules(db, hoaId, rulebook.id) : []
    const removed =
      rulebook && data.which === "draft"
        ? ((await getJson(getBucket(), jobOutputKey(hoaId, rulebook.jobId, "save-draft", "removed"), removedSchema)) ??
          [])
        : []
    return {
      rulebook,
      rules: rules.toSorted((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title)),
      removed,
      buildJobId: latestBuild?.id ?? null,
      isBuilding: building !== null,
      lastBuildError: describeBuildProblem(latestBuild),
      blockers: data.which === "draft" ? publishBlockers(rules) : []
    }
  })

async function loadDraftRule(hoaId: string, ruleId: string) {
  const db = getDb()
  const draft = await getRulebookByStatus(db, hoaId, "draft")
  const rule = await getRule(db, hoaId, ruleId)
  if (!draft || !rule || rule.rulebookId !== draft.id) {
    throw new Error("Only rules in the draft rulebook can be changed.")
  }
  return { db, rule }
}

/** Saves an administrator's edit; Verify runs again and the rule goes back to pending. */
export const saveRule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ ruleId: z.string(), changes: ruleChangesSchema }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    if (rule.citations.length === 0) {
      throw new Error("Add the passage this rule comes from before saving.")
    }
    const edited = applyRuleChanges(rule, data.changes)
    await updateRule(db, context.hoa.id, edited)
    return edited
  })

/**
 * Adds a citation picked in the document viewer. The client sends only the document, page and character range; the
 * quote is copied from the stored page, so it's always the document's own words.
 */
export const addRuleCitation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ruleId: z.string(),
        documentId: z.string(),
        pageIndex: z.number().int().positive(),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    const document = await getGoverningDocument(db, context.hoa.id, data.documentId)
    const page = document
      ? await getJson(getBucket(), governingKeys(context.hoa.id, document.id).page(data.pageIndex), pageSchema)
      : null
    if (!document || !page) {
      throw new Error("That page isn't available.")
    }
    const cited = addCitation(rule, citationFromSelection(page, data, document.title))
    await updateRule(db, context.hoa.id, cited)
    return cited
  })

/** Replaces one of a rule's citations with a passage picked in the document viewer, copied from the stored page. */
export const replaceRuleCitation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ruleId: z.string(),
        index: z.number().int().nonnegative(),
        documentId: z.string(),
        pageIndex: z.number().int().positive(),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    const document = await getGoverningDocument(db, context.hoa.id, data.documentId)
    const page = document
      ? await getJson(getBucket(), governingKeys(context.hoa.id, document.id).page(data.pageIndex), pageSchema)
      : null
    if (!document || !page) {
      throw new Error("That page isn't available.")
    }
    const updated = replaceCitation(rule, data.index, citationFromSelection(page, data, document.title))
    await updateRule(db, context.hoa.id, updated)
    return updated
  })

/** Removes one of a rule's citations; a rule without any can't be saved or approved until one is added. */
export const removeRuleCitation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ ruleId: z.string(), index: z.number().int().nonnegative() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    const updated = removeCitation(rule, data.index)
    await updateRule(db, context.hoa.id, updated)
    return updated
  })

/** Approves or rejects a rule. A rule whose quote isn't found can't be approved. */
export const reviewRule = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ ruleId: z.string(), status: z.enum(["approved", "rejected", "pending"]), note: z.string().nullable() })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    const blocker = data.status === "approved" ? approvalBlocker(rule) : null
    if (blocker) {
      throw new Error(blocker)
    }
    const reviewed: Rule = {
      ...rule,
      review: {
        ...rule.review,
        status: data.status,
        reviewedBy: context.user.id,
        reviewedAt: new Date().toISOString(),
        note: data.note
      }
    }
    await updateRule(db, context.hoa.id, reviewed)
    return reviewed
  })

/** Approves every pending draft rule that has no open issues. Returns how many were approved. */
export const approveReadyRules = createServerFn({ method: "POST" }).handler(async () => {
  const context = await requireAdministrator()
  const db = getDb()
  const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
  if (!draft) {
    throw new Error("There's no draft to approve.")
  }
  const reviewedAt = new Date().toISOString()
  const approved = readyToApprove(await listRules(db, context.hoa.id, draft.id)).map((rule): Rule => ({
    ...rule,
    review: { ...rule.review, status: "approved", reviewedBy: context.user.id, reviewedAt }
  }))
  await updateRules(db, context.hoa.id, approved)
  return { count: approved.length }
})

/**
 * Starts editing the published rulebook: a draft copy the administrator changes and publishes as the next version.
 * The copy has no build job; its id only keeps the record's shape.
 */
export const editPublishedRulebook = createServerFn({ method: "POST" }).handler(async () => {
  const context = await requireAdministrator()
  const db = getDb()
  const hoaId = context.hoa.id
  if (await getRulebookByStatus(db, hoaId, "draft")) {
    throw new Error("A draft is already open. Publish or discard it first.")
  }
  if (await getRulebookByStatus(db, hoaId, "building")) {
    throw new Error("Wait for the rulebook build to finish.")
  }
  const published = await getRulebookByStatus(db, hoaId, "published")
  if (!published) {
    throw new Error("Nothing is published yet. Build the rulebook first.")
  }
  const draft = await copyRulebookAsDraft(db, hoaId, {
    source: published,
    sourceRules: await listRules(db, hoaId, published.id),
    draftId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    now: new Date().toISOString()
  })
  return { rulebookId: draft.id }
})

/** Removes a rule from the draft. */
export const deleteDraftRule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ ruleId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    await deleteRule(db, context.hoa.id, rule.id)
  })

/** Throws the draft away; the published rulebook stays as it is. */
export const discardRulebookDraft = createServerFn({ method: "POST" }).handler(async () => {
  const context = await requireAdministrator()
  const db = getDb()
  const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
  if (draft) {
    await discardDraft(db, context.hoa.id, draft.id)
  }
})

/** Dismisses an issue with a note, such as a conflict the administrator has decided. */
export const resolveIssue = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ ruleId: z.string(), issueIndex: z.number().int().nonnegative(), note: z.string().trim().min(1) })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const { db, rule } = await loadDraftRule(context.hoa.id, data.ruleId)
    const resolution = { note: data.note, resolvedBy: context.user.id, resolvedAt: new Date().toISOString() }
    const resolved: Rule = {
      ...rule,
      issues: rule.issues.map((issue, index) => (index === data.issueIndex ? { ...issue, resolution } : issue))
    }
    await updateRule(db, context.hoa.id, resolved)
    return resolved
  })

/** Publishes the draft as the next version, once nothing is pending and every conflict is resolved. */
export const publishRulebook = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ rulebookId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
    if (draft?.id !== data.rulebookId) {
      throw new Error("That draft is no longer current.")
    }
    const blockers = publishBlockers(await listRules(db, context.hoa.id, draft.id))
    if (blockers.length > 0) {
      throw new Error(blockers.join(" "))
    }
    const version = await publishRulebookRecord(db, context.hoa.id, {
      rulebookId: draft.id,
      userId: context.user.id,
      now: new Date().toISOString()
    })
    return { version }
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
  const rules = published ? await listRules(db, context.hoa.id, published.id) : []
  const documents = await listGoverningDocuments(db, context.hoa.id)
  return {
    hoaName: context.hoa.name,
    publishedVersion: published?.version ?? null,
    publishedAt: published?.publishedAt ?? null,
    ruleCount: rules.filter((rule) => rule.review.status === "approved").length,
    documentTitles: documents.filter((document) => document.status === "ready").map((document) => document.title)
  }
})
