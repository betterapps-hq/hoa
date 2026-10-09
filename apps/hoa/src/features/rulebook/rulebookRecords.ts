import type { RulebookContent } from "@/db/rulebookContentRepository"
import type { RulebookRecords } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { CitedProvision } from "./CitationViewer/CitationViewer"
import type { RulebookSources } from "./rulebook.functions"
import type { ReferencedRule } from "./RuleReference/RuleReference"

// A rulebook's records as the rules UX reads them, and the citations its rule references show.

const isApproved = (record: { review: T.Review }) => record.review.status === "approved"

/** A rulebook's records with the sources they cite. The published rulebook shows only what its rules file holds. */
export function recordsOf(
  sources: RulebookSources,
  content: RulebookContent,
  which: "draft" | "published"
): RulebookRecords {
  return {
    organization: sources.organization,
    documents: sources.documents,
    provisions: sources.provisions,
    terms: which === "draft" ? content.terms : content.terms.filter(isApproved),
    rules: which === "draft" ? content.rules : content.rules.filter(isApproved),
    settings: content.settings,
    questions: content.questions
  }
}

/** "30 days", "1 day": an amount in its unit's label, which names the plural. */
export function amountText(value: number, unit: T.TermKey, vocabulary: Vocabulary) {
  const label = vocabulary.label(unit)
  return `${value} ${Math.abs(value) === 1 && /[^s]s$/.test(label) ? label.slice(0, -1) : label}`
}

/** "1 problem", "2 problems" */
export const countOf = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A document's short name for citations: its key in words, "Use restrictions" for `use-restrictions`. */
export const documentName = (documentKey: string) => capitalize(documentKey.replaceAll("-", " "))

/** A provision label as people cite it: "Article 4" for `article-4`, "Exhibit C", "1.1, paragraph 2" for `1.1/p2`. */
export function readableLabel(label: string) {
  const [base = label, ...paragraphs] = label.split("/p")
  // A named part: "article-4", "exhibit-c", "part-one".
  const [, name, rest] = /^([a-z]+)-([a-z0-9-]+)$/.exec(base) ?? []
  const head =
    name && rest ? `${capitalize(name)} ${rest.length === 1 ? rest.toUpperCase() : rest.replaceAll("-", " ")}` : base
  return [head, ...paragraphs.map((count) => `paragraph ${count}`)].join(", ")
}

const documentKeyOf = (provisionKey: T.ProvisionKey) => provisionKey.slice(0, provisionKey.indexOf(":"))

/** "Declaration 4.3(b)": the document's short name and the provision's label. */
export function citationLabel(provisionKey: T.ProvisionKey) {
  const documentKey = documentKeyOf(provisionKey)
  return `${documentName(documentKey)} ${readableLabel(provisionKey.slice(documentKey.length + 1))}`
}

export type CitationIndex = {
  provisions: Map<T.ProvisionKey, T.Provision>
  documents: Map<string, T.GoverningDocument>
}

export function citationIndex(records: Pick<RulebookRecords, "provisions" | "documents">): CitationIndex {
  return {
    provisions: new Map(records.provisions.map((provision) => [provision.key, provision])),
    documents: new Map(records.documents.map((document) => [document.key, document]))
  }
}

/** A provision's ancestors, nearest first. */
function ancestorsOf(index: CitationIndex, provision: T.Provision) {
  const ancestors: T.Provision[] = []
  const documentKey = documentKeyOf(provision.key)
  let parent = provision.parentLabel
  while (parent !== null && ancestors.length < 20) {
    const found = index.provisions.get(`${documentKey}:${parent}`)
    if (!found) {
      break
    }
    ancestors.push(found)
    parent = found.parentLabel
  }
  return ancestors
}

/**
 * A citation as screens show it: the provision's own text with its ancestors' intros before it and their wrap-ups
 * after it, so the operative words are never dropped (schema.md, Sources, Lead-ins and wrap-ups).
 */
export function citedProvision(index: CitationIndex, citation: T.Citation): CitedProvision {
  const provision = index.provisions.get(citation.provisionKey)
  const ancestors = provision ? ancestorsOf(index, provision) : []
  return {
    provisionKey: citation.provisionKey,
    label: citationLabel(citation.provisionKey),
    documentTitle:
      index.documents.get(documentKeyOf(citation.provisionKey))?.title ?? documentKeyOf(citation.provisionKey),
    heading: provision?.heading ?? null,
    intros: ancestors.flatMap((ancestor) => (ancestor.intro ? [ancestor.intro] : [])).toReversed(),
    text: provision?.text ?? "This provision isn't in the documents.",
    wrapUps: ancestors.flatMap((ancestor) => (ancestor.wrapUp ? [ancestor.wrapUp] : [])),
    highlight: citation.highlight,
    anchors: provision?.anchors ?? []
  }
}

/** A rule as a reference shows it: its title and its citations, the main one first. */
export function referencedRule(
  index: CitationIndex,
  rule: Pick<T.Rule, "key" | "title" | "citations">
): ReferencedRule {
  return {
    key: rule.key,
    title: rule.title,
    citations: rule.citations.map((citation) => citedProvision(index, citation))
  }
}

/** The rules a rule names, and the rules that name it, as keys. */
export function relatedRules(rule: T.Rule, rules: T.Rule[]) {
  const overrides =
    (rule.kind === "norm" || rule.kind === "discretion") && Array.isArray(rule.overrides) ? rule.overrides : []
  const live = rules.filter((item) => item.review.status !== "rejected" && item.key !== rule.key)
  return {
    overrides,
    overriddenBy: live
      .filter(
        (item) =>
          (item.kind === "norm" || item.kind === "discretion") &&
          Array.isArray(item.overrides) &&
          item.overrides.includes(rule.key)
      )
      .map((item) => item.key),
    enforces: rule.kind === "sanction" ? rule.enforces.rules : [],
    enforcedBy: live
      .filter((item) => item.kind === "sanction" && item.enforces.rules.includes(rule.key))
      .map((item) => item.key),
    limits: rule.kind === "limit" ? rule.limits : []
  }
}
