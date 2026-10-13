import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { RulebookRecords } from "@/rulebook/assemble"
import type { Id, Review, RulesFile, Term } from "@/schema/types"
import { rulesFile } from "@/schema/zod"

// The committed golden encoding of the sample organization's documents (samples/declaration/rules.json): the
// Declaration, its Use Restrictions and a slice of the Residential Design Guidelines, parsed once per test file. Every
// record in it is proposed.
let parsed: RulesFile | undefined

/** A fresh copy of the sample rules file, safe to change. */
export function sampleRulesFile(): RulesFile {
  parsed ??= rulesFile.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, "../../samples/declaration/rules.json"), "utf8"))
  )
  return structuredClone(parsed)
}

/** A rules file's records, every one approved, and belonging to the organization. */
export function approvedRecords({
  file,
  organization,
  approvedBy,
  now
}: {
  file: RulesFile
  organization: { id: Id; name: string }
  approvedBy: Id
  now: string
}): RulebookRecords {
  const review: Review = { status: "approved", by: approvedBy, at: now, note: null }
  return {
    organization,
    documents: file.documents,
    provisions: file.provisions.map((provision) => ({
      ...provision,
      noRule: provision.noRule && { ...provision.noRule, review }
    })),
    terms: [...file.terms, ...file.proposedCore].map((term) => ({
      ...term,
      organizationId: term.organizationId === null ? null : organization.id,
      review
    })),
    rules: file.rules.map((rule) => ({ ...rule, review })),
    settings: { ...file.settings, review },
    questions: file.questions
  }
}

/**
 * The sample rules file without the Residential Design Guidelines' encoding: the Declaration and its Use Restrictions
 * alone, with the guidelines named but not uploaded. The fence fixture (fenceSchemaFixture.ts) and the review rules
 * built on it add their own stand-in for the guidelines' fence rules to this.
 */
export function sampleDeclarationRulesFile(): RulesFile {
  return withoutDocument(sampleRulesFile(), "guidelines")
}

/**
 * A rules file without one document's encoding: its provisions, the rules and questions citing them, the terms only it
 * defines (with their values and properties), and every other record's citations of it. The document stays, named but
 * not uploaded.
 */
function withoutDocument(file: RulesFile, documentKey: string): RulesFile {
  const isGone = (key: string) => key.startsWith(`${documentKey}:`)
  const citesOnlyIt = (citations: readonly { provisionKey: string }[]) =>
    citations.length > 0 && citations.every((citation) => isGone(citation.provisionKey))

  // A value goes with its set, a property or category with its thing.
  const ownerOf = (term: Term) => {
    if (term.kind === "value") {
      return term.set
    }
    return term.kind === "property" || term.kind === "category" ? term.of : null
  }
  const dropped = new Set(file.terms.filter((term) => citesOnlyIt(term.citations)).map((term) => term.key))
  let isGrowing = true
  while (isGrowing) {
    isGrowing = false
    for (const term of file.terms) {
      const owner = ownerOf(term)
      if (!dropped.has(term.key) && owner !== null && dropped.has(owner)) {
        dropped.add(term.key)
        isGrowing = true
      }
    }
  }

  // Every remaining record's citations of the document go: filtered out of lists, and a single one (a label's) nulled.
  const isGoneCitation = (item: unknown) =>
    typeof item === "object" && item !== null && "provisionKey" in item && isGone(String(item.provisionKey))
  const strip = <T>(value: T): T => {
    if (Array.isArray(value)) {
      return value.filter((item) => !isGoneCitation(item)).map(strip) as T
    }
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, isGoneCitation(item) ? null : strip(item)])
      ) as T
    }
    return value
  }

  const rules = file.rules.filter((rule) => !isGone(rule.key))
  const ruleKeys = new Set(rules.map((rule) => rule.key))
  return rulesFile.parse({
    ...file,
    documents: file.documents.map((document) =>
      document.key === documentKey ? { ...document, edition: null } : document
    ),
    provisions: file.provisions.filter((provision) => !isGone(provision.key)),
    terms: strip(file.terms.filter((term) => !dropped.has(term.key))),
    rules: strip(rules),
    settings: strip(file.settings),
    questions: file.questions.filter(
      (question) => question.about.rules.every((key) => ruleKeys.has(key)) && !citesOnlyIt(question.citations)
    )
  })
}
