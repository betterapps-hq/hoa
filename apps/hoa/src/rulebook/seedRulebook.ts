import { fileLessDocumentRow, provisionRows } from "@/db/documentRepository"
import { questionRow, ruleRow, termRow } from "@/db/rulebookContentRepository"
import { governingDocuments, provisions, rulebookQuestions, rulebookRules, rulebooks, rulebookTerms } from "@/db/schema"
import { insertSql, sqlLiteral } from "@/db/sql"
import type { Id, Review, RulesFile } from "@/schema/types"
import { rulebookKeys } from "@/storage/keys"
import { assembleRulesFile, type RulebookRecords } from "./assemble"

// Publishes a rules file as an organization's rulebook without a build (implementation-plan.md, 3.11), so reviews can
// run before the rules UX exists. Every record is approved; the D1 rows come out as SQL for `wrangler d1 execute`, and
// the file to put in R2 is assembled from the same records. Running the SQL again replaces the same rulebook.

export type RulebookSeedInput = {
  file: RulesFile
  organization: { id: Id; name: string }
  rulebookId: string
  approvedBy: Id
  now: string
}

/** A rules file's records, every one approved, and belonging to the organization. */
export function approvedRecords({
  file,
  organization,
  approvedBy,
  now
}: Omit<RulebookSeedInput, "rulebookId">): RulebookRecords {
  const review: Review = { status: "approved", by: approvedBy, at: now, note: null }
  const terms = [...file.terms, ...file.proposedCore].map((term) => ({
    ...term,
    organizationId: term.organizationId === null ? null : organization.id,
    review
  }))
  return {
    organization,
    documents: file.documents,
    provisions: file.provisions.map((provision) => ({
      ...provision,
      noRule: provision.noRule && { ...provision.noRule, review }
    })),
    terms,
    rules: file.rules.map((rule) => ({ ...rule, review })),
    settings: { ...file.settings, review },
    questions: file.questions
  }
}

const list = (values: readonly string[]) => `(${values.map(sqlLiteral).join(", ")})`

export async function seedRulebook(input: RulebookSeedInput) {
  const { organization, rulebookId, approvedBy, now } = input
  const records = approvedRecords(input)
  const { sha256, json } = await assembleRulesFile(records)
  const fileKey = rulebookKeys(organization.id, rulebookId).file
  const hoaId = sqlLiteral(organization.id)
  const rulebook = sqlLiteral(rulebookId)

  const documents = records.documents.map((document) => ({ id: `${rulebookId}:${document.key}`, document }))
  const documentIds = list(documents.map((record) => record.id))
  const provisionsByDocument = Map.groupBy(records.provisions, (provision) =>
    provision.key.slice(0, provision.key.indexOf(":"))
  )
  const [ruleRows, termRows] = await Promise.all([
    Promise.all(records.rules.map((rule) => ruleRow(organization.id, rulebookId, rule))),
    Promise.all(records.terms.map((term) => termRow(organization.id, rulebookId, term)))
  ])

  const statements = [
    // Another document holding one of these keys gives it up.
    `UPDATE governing_documents SET key = NULL, document_json = NULL WHERE hoa_id = ${hoaId} AND key IN ${list(
      documents.map((record) => record.document.key)
    )} AND id NOT IN ${documentIds};`,
    `DELETE FROM provisions WHERE hoa_id = ${hoaId} AND document_id IN ${documentIds};`,
    ...["rulebook_rules", "rulebook_terms", "rulebook_questions", "rulebooks"].map(
      (table) =>
        `DELETE FROM ${table} WHERE hoa_id = ${hoaId} AND ${table === "rulebooks" ? "id" : "rulebook_id"} = ${rulebook};`
    ),
    `UPDATE rulebooks SET status = 'superseded' WHERE hoa_id = ${hoaId} AND status = 'published';`,
    ...documents.map((record) =>
      insertSql(governingDocuments, fileLessDocumentRow(organization.id, record, approvedBy, now), "replace")
    ),
    ...documents.flatMap((record) =>
      provisionRows(organization.id, record.id, provisionsByDocument.get(record.document.key) ?? []).map((row) =>
        insertSql(provisions, row, "replace")
      )
    ),
    insertSql(rulebooks, {
      id: rulebookId,
      hoaId: organization.id,
      version: null,
      status: "published",
      error: null,
      // The first build's catalog; rulebooks in the rules schema have none. The column goes at cutover (9.6).
      catalogVersion: 0,
      sourceDocumentIds: documents.filter((record) => record.document.edition).map((record) => record.id),
      jobId: "seed",
      createdAt: now,
      publishedBy: approvedBy,
      publishedAt: now,
      settings: records.settings,
      fileKey,
      fileSha256: sha256,
      coverage: { provisions: records.provisions.length, uncovered: [] }
    }),
    `UPDATE rulebooks SET version = (SELECT COALESCE(MAX(version), 0) + 1 FROM rulebooks WHERE hoa_id = ${hoaId}) WHERE id = ${rulebook};`,
    ...ruleRows.map((row) => insertSql(rulebookRules, row)),
    ...termRows.map((row) => insertSql(rulebookTerms, row)),
    ...records.questions.map((question) =>
      insertSql(rulebookQuestions, questionRow(organization.id, rulebookId, question))
    )
  ]
  return { statements, fileKey, json, sha256 }
}
