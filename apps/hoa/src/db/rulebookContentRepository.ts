import { and, desc, eq, ne } from "drizzle-orm"
import { ruleContentHash, termContentHash } from "@/rulebook/carryForward"
import { rulebookCoverage, type RulebookCoverage } from "@/rulebook/coverage"
import type { Question, Rule, Settings, Term } from "@/schema/types"
import {
  question as questionSchema,
  rule as ruleSchema,
  settings as settingsSchema,
  term as termSchema
} from "@/schema/zod"
import { chunk, insertChunks, runBatch } from "./batching"
import type { Database } from "./database"
import { rulebookQuestions, rulebookRules, rulebooks, rulebookTerms, rules } from "./schema"

// A rulebook's records in the rules schema (encoding.md, Storage): rules, terms and questions in their own tables, and
// the settings and coverage report on the rulebook row. Records are validated with the schema's Zod when written and
// when read.

/** Everything a build saves for a rulebook. Terms include proposed core terms, which have no organizationId. */
export type RulebookContent = {
  settings: Settings
  coverage: RulebookCoverage
  rules: Rule[]
  terms: Term[]
  questions: Question[]
}

/** Where a published rulebook's rules file is in R2, and its SHA-256. */
export type RulesFileRef = { fileKey: string; fileSha256: string }

export async function ruleRow(
  hoaId: string,
  rulebookId: string,
  rule: Rule
): Promise<typeof rulebookRules.$inferInsert> {
  return {
    hoaId,
    rulebookId,
    ruleKey: rule.key,
    kind: rule.kind,
    requestTypes: rule.requestTypes,
    appliesTo: rule.appliesTo,
    reviewStatus: rule.review.status,
    contentHash: await ruleContentHash(rule),
    rule
  }
}

export async function termRow(
  hoaId: string,
  rulebookId: string,
  term: Term
): Promise<typeof rulebookTerms.$inferInsert> {
  return {
    hoaId,
    rulebookId,
    termKey: term.key,
    kind: term.kind,
    reviewStatus: term.review.status,
    contentHash: await termContentHash(term),
    term
  }
}

export function questionRow(
  hoaId: string,
  rulebookId: string,
  { id, answer, ...question }: Question
): typeof rulebookQuestions.$inferInsert {
  return { hoaId, rulebookId, id, question, answer }
}

const storedQuestion = questionSchema.omit({ id: true, answer: true })

function toQuestion(row: typeof rulebookQuestions.$inferSelect): Question {
  return {
    id: row.id,
    ...storedQuestion.parse(row.question),
    answer: questionSchema.shape.answer.parse(row.answer ?? null)
  }
}

const inRulebook = <T extends typeof rulebookRules | typeof rulebookTerms | typeof rulebookQuestions>(
  table: T,
  hoaId: string,
  rulebookId: string
) => and(eq(table.hoaId, hoaId), eq(table.rulebookId, rulebookId))

/** Writes a rulebook's records in one batch, replacing any it had, so a retried save-draft step writes them once. */
export async function saveRulebookContent(db: Database, hoaId: string, rulebookId: string, content: RulebookContent) {
  const [ruleRows, termRows] = await Promise.all([
    Promise.all(content.rules.map((rule) => ruleRow(hoaId, rulebookId, ruleSchema.parse(rule)))),
    Promise.all(content.terms.map((term) => termRow(hoaId, rulebookId, termSchema.parse(term))))
  ])
  const questionRows = content.questions.map((question) =>
    questionRow(hoaId, rulebookId, questionSchema.parse(question))
  )
  await runBatch(db, [
    db.delete(rulebookRules).where(inRulebook(rulebookRules, hoaId, rulebookId)),
    db.delete(rulebookTerms).where(inRulebook(rulebookTerms, hoaId, rulebookId)),
    db.delete(rulebookQuestions).where(inRulebook(rulebookQuestions, hoaId, rulebookId)),
    ...insertChunks(rulebookRules, ruleRows).map((rows) => db.insert(rulebookRules).values(rows)),
    ...insertChunks(rulebookTerms, termRows).map((rows) => db.insert(rulebookTerms).values(rows)),
    ...insertChunks(rulebookQuestions, questionRows).map((rows) => db.insert(rulebookQuestions).values(rows)),
    db
      .update(rulebooks)
      .set({ settings: settingsSchema.parse(content.settings), coverage: rulebookCoverage.parse(content.coverage) })
      .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId)))
  ])
}

/**
 * Makes a built rulebook the organization's draft, replacing the draft it had (encoding.md, Save draft): the old draft
 * and its records go in the same batch, so there's never more than one.
 */
export async function promoteToDraft(db: Database, hoaId: string, rulebookId: string) {
  const previous = await db
    .select({ id: rulebooks.id })
    .from(rulebooks)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.status, "draft"), ne(rulebooks.id, rulebookId)))
  await runBatch(db, [
    ...previous.flatMap(({ id }) => [
      db.delete(rulebookRules).where(inRulebook(rulebookRules, hoaId, id)),
      db.delete(rulebookTerms).where(inRulebook(rulebookTerms, hoaId, id)),
      db.delete(rulebookQuestions).where(inRulebook(rulebookQuestions, hoaId, id)),
      db.delete(rules).where(and(eq(rules.hoaId, hoaId), eq(rules.rulebookId, id))),
      db.delete(rulebooks).where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, id)))
    ]),
    db
      .update(rulebooks)
      .set({ status: "draft" })
      .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId), eq(rulebooks.status, "building")))
  ])
}

/** A rulebook's records, or null while it has none (a rulebook still building). */
export async function getRulebookContent(
  db: Database,
  hoaId: string,
  rulebookId: string
): Promise<RulebookContent | null> {
  const rulebook = await db
    .select({ settings: rulebooks.settings, coverage: rulebooks.coverage })
    .from(rulebooks)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId)))
    .get()
  if (!rulebook?.settings || !rulebook.coverage) {
    return null
  }
  const [ruleRows, termRows, questionRows] = await Promise.all([
    db
      .select({ rule: rulebookRules.rule })
      .from(rulebookRules)
      .where(inRulebook(rulebookRules, hoaId, rulebookId)),
    db
      .select({ term: rulebookTerms.term })
      .from(rulebookTerms)
      .where(inRulebook(rulebookTerms, hoaId, rulebookId)),
    db
      .select()
      .from(rulebookQuestions)
      .where(inRulebook(rulebookQuestions, hoaId, rulebookId))
  ])
  return {
    settings: settingsSchema.parse(rulebook.settings),
    coverage: rulebookCoverage.parse(rulebook.coverage),
    rules: ruleRows.map((row) => ruleSchema.parse(row.rule)),
    terms: termRows.map((row) => termSchema.parse(row.term)),
    questions: questionRows.map(toQuestion)
  }
}

export async function getRulebookRule(db: Database, hoaId: string, rulebookId: string, ruleKey: string) {
  const row = await db
    .select({ rule: rulebookRules.rule })
    .from(rulebookRules)
    .where(and(inRulebook(rulebookRules, hoaId, rulebookId), eq(rulebookRules.ruleKey, ruleKey)))
    .get()
  return row ? ruleSchema.parse(row.rule) : null
}

/** Records an administrator changed in review, saved in one batch: rules, terms and questions by key, and the settings. */
export type RulebookChanges = {
  rules?: Rule[]
  terms?: Term[]
  questions?: Question[]
  settings?: Settings | null
}

/**
 * Saves reviewed or edited records, adding any that are new. A change of up to 100 records lands whole; a bulk review
 * goes in batches of 100, each landing whole.
 */
export async function saveRulebookChanges(db: Database, hoaId: string, rulebookId: string, changes: RulebookChanges) {
  const [ruleRows, termRows] = await Promise.all([
    Promise.all((changes.rules ?? []).map((rule) => ruleRow(hoaId, rulebookId, ruleSchema.parse(rule)))),
    Promise.all((changes.terms ?? []).map((term) => termRow(hoaId, rulebookId, termSchema.parse(term))))
  ])
  const questionRows = (changes.questions ?? []).map((question) =>
    questionRow(hoaId, rulebookId, questionSchema.parse(question))
  )
  const statements = [
    ...ruleRows.map((row) => {
      const { kind, requestTypes, appliesTo, reviewStatus, contentHash, rule } = row
      return db
        .insert(rulebookRules)
        .values(row)
        .onConflictDoUpdate({
          target: [rulebookRules.rulebookId, rulebookRules.ruleKey],
          set: { kind, requestTypes, appliesTo, reviewStatus, contentHash, rule }
        })
    }),
    ...termRows.map((row) => {
      const { kind, reviewStatus, contentHash, term } = row
      return db
        .insert(rulebookTerms)
        .values(row)
        .onConflictDoUpdate({
          target: [rulebookTerms.rulebookId, rulebookTerms.termKey],
          set: { kind, reviewStatus, contentHash, term }
        })
    }),
    ...questionRows.map((row) =>
      db
        .insert(rulebookQuestions)
        .values(row)
        .onConflictDoUpdate({
          target: [rulebookQuestions.rulebookId, rulebookQuestions.id],
          set: { question: row.question, answer: row.answer }
        })
    ),
    ...(changes.settings
      ? [
          db
            .update(rulebooks)
            .set({ settings: settingsSchema.parse(changes.settings) })
            .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId)))
        ]
      : [])
  ]
  for (const group of chunk(statements, 100)) {
    await runBatch(db, group)
  }
}

/** Removes a rule from a draft. */
export async function deleteRulebookRule(db: Database, hoaId: string, rulebookId: string, ruleKey: string) {
  await db
    .delete(rulebookRules)
    .where(and(inRulebook(rulebookRules, hoaId, rulebookId), eq(rulebookRules.ruleKey, ruleKey)))
}

/** Records where a rulebook's rules file was written, when it's published. */
export async function recordRulebookFile(db: Database, hoaId: string, rulebookId: string, file: RulesFileRef) {
  await db
    .update(rulebooks)
    .set(file)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.id, rulebookId)))
}

/** The published rulebook's rules file, or null when none is published as a file. */
export async function getPublishedRulesFile(
  db: Database,
  hoaId: string
): Promise<({ rulebookId: string } & RulesFileRef) | null> {
  const row = await db
    .select({ rulebookId: rulebooks.id, fileKey: rulebooks.fileKey, fileSha256: rulebooks.fileSha256 })
    .from(rulebooks)
    .where(and(eq(rulebooks.hoaId, hoaId), eq(rulebooks.status, "published")))
    .orderBy(desc(rulebooks.publishedAt))
    .limit(1)
    .get()
  return row?.fileKey && row.fileSha256
    ? { rulebookId: row.rulebookId, fileKey: row.fileKey, fileSha256: row.fileSha256 }
    : null
}
