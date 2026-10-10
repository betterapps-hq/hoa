import type { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptVariables } from "@/ai/prompts"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, ValueType } from "@/schema/types"
import type { JsonPath } from "@/schema/validate"
import { createVocabulary } from "@/schema/vocabulary"
import type { RuleContent, TermContent } from "@/schema/zod"
import type { StructureCheck } from "./check"
import type { CleanDocument } from "./clean"
import { summarizeRule, type TermPair } from "./consolidate"
import type { TermCandidate } from "./definedTerms"
import type { EncodingUnit, UnitAncestor, UnitReference } from "./plan"
import type { StructuredDocument } from "./provisions"
import type { UnitProblem } from "./repair"
import { cleanText, parserOutline } from "./structureRepair"

// The prompt variables of the build's prompts (encoding.md, Prompts and models), as compact text in a fixed order, so
// the same unit always reads the same and provider prompt caching covers the shared parts (core terms first in every
// prompt's template, then the vocabulary, then the unit).

type DocumentLine = Pick<GoverningDocument, "key" | "kind" | "title">
type Variables<Prompt extends keyof typeof pipelinePrompts> = PromptVariables<(typeof pipelinePrompts)[Prompt]>

const byKey = <T extends { key: string }>(records: readonly T[]) =>
  records.toSorted((a, b) => compareCodeUnits(a.key, b.key))

export function documentLine(document: DocumentLine & { edition?: GoverningDocument["edition"] }) {
  const named = document.edition === null ? " (named, not uploaded)" : ""
  return `${document.key} (${document.kind}): ${document.title}${named}`
}

export function valueTypeText(valueType: ValueType) {
  switch (valueType.type) {
    case "quantity":
      return `quantity in ${valueType.unit}`
    case "choice":
      return `choice of ${valueType.set}`
    case "reference":
      return `reference to ${valueType.to ?? "any thing"}`
    case "party":
      return `party${valueType.among ? ` among ${valueType.among.join(", ")}` : ""}`
    default:
      return valueType.type
  }
}

function kindText(term: TermContent) {
  switch (term.kind) {
    case "thing": {
      const request = term.request
        ? `; request: flow ${term.request.flow}, governing date ${term.request.governingDate ?? "evaluation date"}, lot ${term.request.lot}`
        : ""
      return `thing (${term.nature})${request}`
    }
    case "category":
      return `category of ${term.of} where ${canonicalJson(term.criteria)}`
    case "property": {
      const notes = [
        term.many ? "many" : "",
        term.ifUnstated === "absent" ? "absent unless stated" : "",
        term.derived ? "derived" : ""
      ]
      return [`property of ${term.of}: ${valueTypeText(term.valueType)}`, ...notes.filter(Boolean)].join(", ")
    }
    case "value":
      return `value in ${term.set}${term.broader.length > 0 ? `, under ${term.broader.join(", ")}` : ""}`
    case "value-set":
      return `value set (${term.complete ? "complete" : "open"})`
    case "unit":
      return `unit of ${term.dimension}${term.perBase ? ` (${term.perBase} base units)` : ""}`
  }
}

/** One term per line: key, kind, labels (with plurals and roles) and definition. */
function termLine(term: TermContent) {
  const labels = term.labels
    .map((label) => {
      const notes = [label.plural ? `plural "${label.plural}"` : "", label.role === "preferred" ? "" : label.role]
      const note = notes.filter(Boolean).join(", ")
      return `"${label.text}"${note ? ` (${note})` : ""}`
    })
    .join(", ")
  const definition = term.definition ? ` | means: ${term.definition}` : ""
  return `${term.key} | ${kindText(term)} | ${labels}${definition}`
}

export const termLines = (terms: readonly TermContent[]) => byKey(terms).map(termLine).join("\n")

export const coreTermsText = () => termLines(coreTerms)

function headingOf(provision: Pick<Provision, "kind" | "label" | "heading">) {
  return `${provision.kind} ${provision.label}${provision.heading ? `: ${provision.heading}` : ""}`
}

/** A provision as the encoder reads it: its key and heading, then its text, intro and wrap-up in reading order. */
export function provisionBlock(provision: Provision) {
  return [
    `[${provision.key}] ${headingOf(provision)}`,
    provision.text,
    provision.intro ? `intro: ${provision.intro}` : "",
    provision.wrapUp ? `wrap-up: ${provision.wrapUp}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

/** The lead-ins and wrap-ups of a unit's ancestors, outermost first; "none" without any. */
export function contextText(ancestors: readonly UnitAncestor[]) {
  const context = ancestors.map((ancestor) =>
    [
      `[${ancestor.key}] ${headingOf(ancestor)}`,
      ancestor.intro ? `intro: ${ancestor.intro}` : "",
      ancestor.wrapUp ? `wrap-up: ${ancestor.wrapUp}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  )
  return context.join("\n\n") || "none"
}

/** The provisions a unit refers to, with their text; "none" without any. */
export function referencesText(references: readonly UnitReference[]) {
  const blocks = references.map(
    (reference) =>
      `[${reference.key}]${reference.heading ? ` ${reference.heading}` : ""}${reference.isTruncated ? " (truncated)" : ""}\n${reference.text}`
  )
  return blocks.join("\n\n") || "none"
}

/** hoa-provision-encoding: one unit and its context. */
export function provisionEncodingVariables(unit: EncodingUnit, document: DocumentLine): Variables<"provisionEncoding"> {
  return {
    document: documentLine(document),
    provisions: unit.provisions.map(provisionBlock).join("\n\n"),
    context: contextText(unit.context),
    references: referencesText(unit.references),
    terms: termLines(unit.terms) || "none",
    coreTerms: coreTermsText(),
    requestTypes: termLines(unit.requestTypes)
  }
}

/** A JSON path as people write it: rules[1].appliesTo. */
export function pathText(path: JsonPath) {
  return path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`))
    .join("")
    .replace(/^\./, "")
}

/** hoa-encoding-repair: the draft as canonical JSON, its problems with their paths, and the unit's vocabulary. */
export function encodingRepairVariables(
  draft: unknown,
  problems: readonly UnitProblem[],
  terms: readonly TermContent[]
): Variables<"encodingRepair"> {
  return {
    draft: canonicalJson(draft),
    problems: problems
      .map((problem) => `- ${pathText(problem.path) || "(draft)"}: ${problem.message} [${problem.code}]`)
      .join("\n"),
    terms: termLines(terms) || "none",
    coreTerms: coreTermsText()
  }
}

export function candidateText(candidate: TermCandidate) {
  const where = candidate.definedIn.length > 0 ? `defined in ${candidate.definedIn.join(", ")}; ` : ""
  const samples = candidate.samples.map((sample) => `  e.g. ${sample}`)
  const uses = `${candidate.count} use${candidate.count === 1 ? "" : "s"}`
  return [`"${candidate.phrase}" (${candidate.source}; ${where}${uses})`, ...samples].join("\n")
}

/** hoa-term-extraction: one document's definitions provisions and the candidates code found. */
export function termExtractionVariables(
  document: DocumentLine,
  definitions: readonly Provision[],
  candidates: readonly TermCandidate[]
): Variables<"termExtraction"> {
  return {
    document: documentLine(document),
    definitions: definitions.map(provisionBlock).join("\n\n"),
    candidates: candidates.map(candidateText).join("\n") || "none",
    coreTerms: coreTermsText()
  }
}

/** hoa-rulebook-consolidation: rule summaries, near-duplicate term pairs and the documents with their kinds. */
export function rulebookConsolidationVariables(
  rules: readonly RuleContent[],
  terms: readonly TermContent[],
  termPairs: readonly TermPair[],
  documents: readonly (DocumentLine & { edition?: GoverningDocument["edition"] })[]
): Variables<"rulebookConsolidation"> {
  const vocabulary = createVocabulary([...terms])
  const pairs = termPairs.map(
    (pair) => `${pair.keys[0]} "${pair.labels[0]}" ~ ${pair.keys[1]} "${pair.labels[1]}" (${pair.score})`
  )
  return {
    rules: byKey(rules)
      .map((rule) => summarizeRule(rule, vocabulary))
      .join("\n"),
    termPairs: pairs.join("\n") || "none",
    documents: byKey(documents).map(documentLine).join("\n")
  }
}

/** hoa-structure-repair: the cleaned text, the parser's outline of it and why the outline failed its check. */
export function structureRepairVariables(
  title: string,
  clean: CleanDocument,
  documents: readonly StructuredDocument[],
  check: StructureCheck
): Variables<"structureRepair"> {
  return {
    documentTitle: title,
    pageText: cleanText(clean).text,
    parserOutline: parserOutline(clean, documents),
    problems: check.problems.map((problem) => `- ${problem.message} [${problem.code}]`).join("\n")
  }
}
