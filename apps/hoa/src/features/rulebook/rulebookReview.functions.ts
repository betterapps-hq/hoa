import { createServerFn } from "@tanstack/react-start"
import { match } from "ts-pattern"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import { updateProvisions } from "@/db/documentRepository"
import { saveRulebookChanges } from "@/db/rulebookContentRepository"
import { getRulebookByStatus } from "@/db/rulebookRepository"
import { loadRulebookRecords, type RulebookRecords } from "@/rulebook/assemble"
import { answerQuestion, resolveIssue, reviewIssues, reviewRecords, type RecordRef } from "@/rulebook/review"
import { withLawFirst } from "@/schema/law"
import type * as Rules from "@/schema/types"
import { rule as ruleSchema, ruleDraft, settings as settingsSchema } from "@/schema/zod"
import { requireAdministrator } from "@/session/requestContext.server"

// Reviewing the draft rulebook (encoding.md, Review): approve, reject, edit, answer questions, give provisions their
// no-rule reasons and edit the settings. Nothing is deleted: rejecting a record leaves it out of the rules file, and a
// rebuild carries the rejection forward. Every change is checked by the schema's Zod and by the review rules in
// src/rulebook/review.ts, which the screens share.

const recordRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rule"), key: z.string() }),
  z.object({ type: z.literal("term"), key: z.string() }),
  z.object({ type: z.literal("settings") }),
  z.object({ type: z.literal("provision"), key: z.string() })
])
const issueRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rule"), key: z.string() }),
  z.object({ type: z.literal("term"), key: z.string() }),
  z.object({ type: z.literal("settings") })
])
const draftInput = { rulebookId: z.string() }
const note = z.string().trim().min(1).nullable()

/** The current draft's records, for an administrator; refuses a draft that has been replaced or published. */
async function openDraft(rulebookId: string) {
  const context = await requireAdministrator()
  const db = getDb()
  const draft = await getRulebookByStatus(db, context.hoa.id, "draft")
  if (draft?.id !== rulebookId) {
    throw new Error("That draft is no longer current.")
  }
  const records = await loadRulebookRecords(db, context.hoa.id, rulebookId)
  const by = context.user.id
  const at = new Date().toISOString()
  return { db, hoaId: context.hoa.id, records, by, at }
}

export type ReviewResult = { updated: number; skipped: { ref: RecordRef; reasons: string[] }[] }

/** Approves, rejects or reopens records; approving skips any record something still blocks, and says why. */
export const reviewRulebookRecords = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ...draftInput,
        refs: z.array(recordRef).min(1),
        status: z.enum(["proposed", "approved", "rejected"]),
        note
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<ReviewResult> => {
    const { db, hoaId, records, by, at } = await openDraft(data.rulebookId)
    const changes = reviewRecords(records, data.refs, { status: data.status, by, at, note: data.note })
    await saveRulebookChanges(db, hoaId, data.rulebookId, changes)
    await updateProvisions(db, hoaId, changes.provisions)
    const updated = changes.rules.length + changes.terms.length + changes.provisions.length + (changes.settings ? 1 : 0)
    return { updated, skipped: changes.skipped }
  })

/** Resolves an issue on a rule, a term or the settings with a note, so it no longer blocks approval. */
export const resolveRulebookIssue = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ ...draftInput, ref: issueRef, index: z.number().int().nonnegative(), note: z.string().trim().min(1) })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { db, hoaId, records, by, at } = await openDraft(data.rulebookId)
    const resolution = { note: data.note, by, at }
    const changes = match(data.ref)
      .with({ type: "settings" }, () => ({ settings: resolveIssue(records.settings, data.index, resolution) }))
      .with({ type: "rule" }, ({ key }) => ({
        rules: [resolveIssue(inDraft(records.rules, key), data.index, resolution)]
      }))
      .with({ type: "term" }, ({ key }) => ({
        terms: [resolveIssue(inDraft(records.terms, key), data.index, resolution)]
      }))
      .exhaustive()
    await saveRulebookChanges(db, hoaId, data.rulebookId, changes)
  })

function inDraft<R extends { key: string }>(records: R[], key: string) {
  const found = records.find((record) => record.key === key)
  if (!found) {
    throw new Error(`${key} isn't in the draft.`)
  }
  return found
}

/** Problems validation finds on a record once a change is in the draft. */
const issuesOf = (records: RulebookRecords, recordKey: string) => reviewIssues(records).get(recordKey) ?? []

/**
 * Saves an edited rule. Its key stays; the edit is the administrator's, so the rule goes back to proposed. Problems
 * validation finds don't stop the save; they come back to be shown, and they block approval.
 */
export const saveRulebookRule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ ...draftInput, rule: ruleDraft }).parse(data))
  .handler(async ({ data }) => {
    const { db, hoaId, records, by, at } = await openDraft(data.rulebookId)
    const existing = inDraft(records.rules, data.rule.key)
    const rule = ruleSchema.parse({
      ...data.rule,
      provenance: { by: "person", userId: by, at },
      review: { status: "proposed", by: null, at: null, note: null },
      issues: existing.issues
    })
    await saveRulebookChanges(db, hoaId, data.rulebookId, { rules: [rule] })
    return issuesOf({ ...records, rules: records.rules.map((item) => (item.key === rule.key ? rule : item)) }, rule.key)
  })

/** Answers a question: its chosen reading's rules are approved, the other candidates rejected. */
export const answerRulebookQuestion = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ ...draftInput, questionId: z.string(), option: z.number().int().nonnegative(), text: note }).parse(data)
  )
  .handler(async ({ data }) => {
    const { db, hoaId, records, by, at } = await openDraft(data.rulebookId)
    const result = answerQuestion(records, {
      questionId: data.questionId,
      option: data.option,
      text: data.text,
      by,
      at
    })
    await saveRulebookChanges(db, hoaId, data.rulebookId, { questions: [result.question], rules: result.rules })
    return { notApproved: result.notApproved }
  })

/**
 * Gives a provision a reason for having no rule, or removes it. The administrator states it, so it's approved as given.
 */
export const setProvisionNoRule = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ...draftInput,
        provisionKey: z.string(),
        noRule: z
          .object({
            reason: z.enum(["heading", "recital", "reserved", "explanatory", "duplicate"]),
            note
          })
          .nullable()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { db, hoaId, records, by, at } = await openDraft(data.rulebookId)
    const provision = inDraft(records.provisions, data.provisionKey)
    const review: Rules.Review = { status: "approved", by, at, note: null }
    await updateProvisions(db, hoaId, [{ ...provision, noRule: data.noRule && { ...data.noRule, review } }])
  })

/** Saves edited settings clauses or policy; the settings go back to proposed, and problems found come back. */
export const saveRulebookSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ...draftInput,
        clauses: settingsSchema.shape.clauses.partial(),
        policy: settingsSchema.shape.policy.nullable()
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { db, hoaId, records } = await openDraft(data.rulebookId)
    const settings = settingsSchema.parse({
      ...records.settings,
      clauses: {
        ...records.settings.clauses,
        ...data.clauses,
        ...(data.clauses.precedence
          ? { precedence: { ...data.clauses.precedence, order: withLawFirst(data.clauses.precedence.order) } }
          : {})
      },
      policy: data.policy ?? records.settings.policy,
      review: { status: "proposed", by: null, at: null, note: null }
    })
    await saveRulebookChanges(db, hoaId, data.rulebookId, { settings })
    return issuesOf({ ...records, settings }, "settings")
  })
