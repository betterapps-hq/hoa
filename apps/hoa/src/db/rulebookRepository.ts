import { and, desc, eq, inArray, max } from "drizzle-orm"
import { rulebookSchema, ruleSchema, type Rule } from "@/rules/rule"
import type { Database } from "./database"
import { rulebooks, rules } from "./schema"

type Rulebook = ReturnType<typeof rulebookSchema.parse>

function toRulebook(row: typeof rulebooks.$inferSelect): Rulebook {
  return rulebookSchema.parse(row)
}

export function insertRulebook(db: Database, rulebook: Rulebook) {
  return db.insert(rulebooks).values(rulebook)
}

export async function getRulebook(db: Database, hoaId: string, id: string) {
  const row = await db
    .select()
    .from(rulebooks)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, id)))
    .get()
  return row ? toRulebook(row) : null
}

/** The HOA's rulebook in a status; at most one is building, one is a draft and one is published. */
export async function getRulebookByStatus(db: Database, hoaId: string, status: "building" | "draft" | "published") {
  const row = await db
    .select()
    .from(rulebooks)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.status, status)))
    .orderBy(desc(rulebooks.createdAt))
    .limit(1)
    .get()
  return row ? toRulebook(row) : null
}

export async function listRules(db: Database, hoaId: string, rulebookId: string): Promise<Rule[]> {
  const rows = await db
    .select()
    .from(rules)
    .where(and(eq(rules.hoaId, hoaId), eq(rules.rulebookId, rulebookId)))
  return rows.map((row) => ruleSchema.parse(row.rule))
}

export async function getRule(db: Database, hoaId: string, id: string): Promise<Rule | null> {
  const row = await db
    .select()
    .from(rules)
    .where(and(eq(rules.hoaId, hoaId), eq(rules.id, id)))
    .get()
  return row ? ruleSchema.parse(row.rule) : null
}

/** Saves an edited rule. Its key never changes after the first save. */
export async function updateRule(db: Database, hoaId: string, rule: Rule) {
  await db
    .update(rules)
    .set({ rule: ruleSchema.parse(rule) })
    .where(and(eq(rules.hoaId, hoaId), eq(rules.id, rule.id)))
}

/** Saves several rules in one batch, such as a bulk approval. */
export async function updateRules(db: Database, hoaId: string, items: readonly Rule[]) {
  const [first, ...rest] = items.map((rule) =>
    db
      .update(rules)
      .set({ rule: ruleSchema.parse(rule) })
      .where(and(eq(rules.hoaId, hoaId), eq(rules.id, rule.id)))
  )
  if (first) {
    await db.batch([first, ...rest])
  }
}

export async function insertRule(db: Database, hoaId: string, rule: Rule) {
  await db.insert(rules).values({ id: rule.id, hoaId, rulebookId: rule.rulebookId, ruleKey: rule.ruleKey, rule })
}

/**
 * Save draft (docs/design/extraction.md, "7. Save draft"), as one batch: the old draft and its rules go, the new rules
 * go in, and the building rulebook becomes the draft.
 */
export async function saveDraft(
  db: Database,
  hoaId: string,
  input: { rulebookId: string; previousDraftId: string | null; rules: readonly Rule[] }
) {
  const previous = input.previousDraftId
  const deletes = previous
    ? [
        db.delete(rules).where(and(eq(rules.hoaId, hoaId), eq(rules.rulebookId, previous))),
        db.delete(rulebooks).where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, previous)))
      ]
    : []
  // Rewriting the new rulebook's rules makes the step safe to retry after a partial write.
  const clear = db.delete(rules).where(and(eq(rules.hoaId, hoaId), eq(rules.rulebookId, input.rulebookId)))
  const inserts = input.rules.map((rule) =>
    db.insert(rules).values({ id: rule.id, hoaId, rulebookId: input.rulebookId, ruleKey: rule.ruleKey, rule })
  )
  const promote = db
    .update(rulebooks)
    .set({ status: "draft" })
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, input.rulebookId)))
  await db.batch([clear, ...deletes, ...inserts, promote])
}

/**
 * Starts editing a published rulebook: a draft copy with new rule ids, keeping each rule's key, approval and edits.
 * The partial unique index refuses it while another draft exists.
 */
export async function copyRulebookAsDraft(
  db: Database,
  hoaId: string,
  input: { source: Rulebook; sourceRules: readonly Rule[]; draftId: string; jobId: string; now: string }
) {
  const draft: Rulebook = {
    ...input.source,
    id: input.draftId,
    version: null,
    status: "draft",
    error: null,
    jobId: input.jobId,
    createdAt: input.now,
    publishedBy: null,
    publishedAt: null
  }
  const copies = input.sourceRules.map((rule): Rule => ({
    ...rule,
    id: crypto.randomUUID(),
    rulebookId: draft.id,
    change: "unchanged"
  }))
  await db.batch([
    db.insert(rulebooks).values(draft),
    ...copies.map((rule) =>
      db.insert(rules).values({ id: rule.id, hoaId, rulebookId: draft.id, ruleKey: rule.ruleKey, rule })
    )
  ])
  return draft
}

/** Removes a rule from a draft. */
export async function deleteRule(db: Database, hoaId: string, id: string) {
  await db.delete(rules).where(and(eq(rules.hoaId, hoaId), eq(rules.id, id)))
}

/** Throws away a draft and its rules; the published rulebook is untouched. */
export async function discardDraft(db: Database, hoaId: string, rulebookId: string) {
  await db.batch([
    db.delete(rules).where(and(eq(rules.hoaId, hoaId), eq(rules.rulebookId, rulebookId))),
    db
      .delete(rulebooks)
      .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId), eq(rulebooks.status, "draft")))
  ])
}

export async function failRulebook(db: Database, hoaId: string, id: string, error: Rulebook["error"]) {
  await db
    .update(rulebooks)
    .set({ status: "failed", error })
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, id), eq(rulebooks.status, "building")))
}

/** Publishes a draft as the next version, superseding the published one, in one batch. */
export async function publishRulebook(
  db: Database,
  hoaId: string,
  input: { rulebookId: string; userId: string; now: string }
) {
  const latest = await db
    .select({ version: max(rulebooks.version) })
    .from(rulebooks)
    .where(eq(rulebooks.hoaId, hoaId))
    .get()
  const version = (latest?.version ?? 0) + 1
  await db.batch([
    db
      .update(rulebooks)
      .set({ status: "superseded" })
      .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.status, "published"))),
    db
      .update(rulebooks)
      .set({ status: "published", version, publishedBy: input.userId, publishedAt: input.now })
      .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, input.rulebookId), eq(rulebooks.status, "draft")))
  ])
  return version
}

/** Rules by id across rulebooks, for showing the rules behind an older review. */
export async function getRulesById(db: Database, hoaId: string, ids: readonly string[]): Promise<Rule[]> {
  if (ids.length === 0) {
    return []
  }
  const rows = await db
    .select()
    .from(rules)
    .where(and(eq(rules.hoaId, hoaId), inArray(rules.id, [...ids])))
  return rows.map((row) => ruleSchema.parse(row.rule))
}
