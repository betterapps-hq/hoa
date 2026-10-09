import type { Database } from "@/db/database"
import { listDocumentRecords, listProvisions } from "@/db/documentRepository"
import { getHoa } from "@/db/hoaRepository"
import { getRulebookContent, type RulesFileRef } from "@/db/rulebookContentRepository"
import type { Review, RulesFile } from "@/schema/types"
import { validateRulebook, type RulebookIssue } from "@/schema/validate"
import { rulesFile } from "@/schema/zod"
import { rulebookKeys } from "@/storage/keys"
import type { ObjectBucket } from "@/storage/objects"
import { canonicalJson, compareCodeUnits, sha256Hex } from "./canonical"

// Publishing (encoding.md, 12 and 13): the rules file is assembled from a rulebook's records, keeping only approved
// terms and rules, then validated, serialized canonically and hashed. The file in R2 is never rewritten; a review
// records its hash and checks it when it reads the file back.

/** A rulebook's records as stored: every review status, and proposed core terms among the terms. */
export type RulebookRecords = Omit<RulesFile, "proposedCore">

export class InvalidRulesFileError extends Error {
  constructor(readonly issues: RulebookIssue[]) {
    const shown = issues.slice(0, 5).map((issue) => `${issue.recordKey}: ${issue.message}`)
    super(`The rules file has ${issues.length} problem(s): ${shown.join("; ")}`)
  }
}

const byKey = (a: { key: string }, b: { key: string }) => compareCodeUnits(a.key, b.key)
const isApproved = (record: { review: Review }) => record.review.status === "approved"

/** Records in a stable order, so the same records give the same file whatever order they were read in. */
function orderRecords(records: RulebookRecords) {
  const documents = records.documents.toSorted(byKey)
  const position = new Map(documents.map((document, index) => [document.key, index]))
  const documentOf = (key: string) => position.get(key.slice(0, key.indexOf(":"))) ?? documents.length
  const terms = records.terms.filter(isApproved).toSorted(byKey)
  return {
    organization: records.organization,
    documents,
    // Within a document, provisions keep their order.
    provisions: records.provisions.toSorted((a, b) => documentOf(a.key) - documentOf(b.key)),
    terms: terms.filter((term) => term.organizationId !== null),
    proposedCore: terms.filter((term) => term.organizationId === null),
    rules: records.rules.filter(isApproved).toSorted(byKey),
    settings: records.settings,
    questions: records.questions.toSorted((a, b) => compareCodeUnits(a.id, b.id))
  }
}

/** The rules file for a rulebook's records, its canonical JSON and that JSON's SHA-256. Throws when it isn't valid. */
export async function assembleRulesFile(records: RulebookRecords) {
  const file = rulesFile.parse(orderRecords(records))
  const issues = validateRulebook(file)
  if (issues.length > 0) {
    throw new InvalidRulesFileError(issues)
  }
  const json = canonicalJson(file)
  return { file, json, sha256: await sha256Hex(json) }
}

/** A rulebook's records from D1: the organization's keyed documents and their provisions, and the rulebook's own. */
export async function loadRulebookRecords(db: Database, hoaId: string, rulebookId: string): Promise<RulebookRecords> {
  const [hoa, documents, content] = await Promise.all([
    getHoa(db, hoaId),
    listDocumentRecords(db, hoaId),
    getRulebookContent(db, hoaId, rulebookId)
  ])
  if (!hoa || !content) {
    throw new Error(`Rulebook ${rulebookId} has no saved records to publish.`)
  }
  return {
    organization: { id: hoa.id, name: hoa.name },
    documents: documents.map((record) => record.document),
    provisions: await listProvisions(
      db,
      hoaId,
      documents.map((record) => record.id)
    ),
    terms: content.terms,
    rules: content.rules,
    settings: content.settings,
    questions: content.questions
  }
}

/** Writes an assembled rules file to the rulebook's key; the caller records the key and hash on the rulebook. */
export async function writeRulesFile(
  bucket: ObjectBucket,
  hoaId: string,
  rulebookId: string,
  assembled: { json: string; sha256: string }
): Promise<RulesFileRef> {
  const fileKey = rulebookKeys(hoaId, rulebookId).file
  await bucket.put(fileKey, assembled.json, { httpMetadata: { contentType: "application/json" } })
  return { fileKey, fileSha256: assembled.sha256 }
}

/** Reads a published rules file, refusing one whose content doesn't match its recorded hash. */
export async function readRulesFile(bucket: ObjectBucket, { fileKey, fileSha256 }: RulesFileRef): Promise<RulesFile> {
  const object = await bucket.get(fileKey)
  if (!object) {
    throw new Error(`The rules file ${fileKey} is missing from storage.`)
  }
  const json = await object.text()
  if ((await sha256Hex(json)) !== fileSha256) {
    throw new Error(`The rules file ${fileKey} doesn't match its recorded SHA-256.`)
  }
  return rulesFile.parse(JSON.parse(json))
}
