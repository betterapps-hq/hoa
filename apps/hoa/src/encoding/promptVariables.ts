import type { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptVariables } from "@/ai/prompts"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, ValueType } from "@/schema/types"
import type { JsonPath } from "@/schema/validate"
import type { TermContent } from "@/schema/zod"
import type { StructureCheck } from "./check"
import type { CleanDocument } from "./clean"
import type { TermCandidate } from "./definedTerms"
import type { UnitAncestor, UnitReference } from "./plan"
import type { StructuredDocument } from "./provisions"
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

/** A provision as a step reads it: its key and heading, then its text, intro and wrap-up in reading order. */
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

/** A JSON path as people write it: rules[1].appliesTo. */
export function pathText(path: JsonPath) {
  return path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`))
    .join("")
    .replace(/^\./, "")
}

/**
 * A candidate with its sample sentences, each starting with the key of the provision it's from (`e.g. [doc:4.1] …`),
 * so a term found only in use can be cited.
 */
export function candidateText(candidate: TermCandidate) {
  const where = candidate.definedIn.length > 0 ? `defined in ${candidate.definedIn.join(", ")}; ` : ""
  const samples = candidate.samples.map((sample) => `  e.g. [${sample.provisionKey}] ${sample.text}`)
  const uses = `${candidate.count} use${candidate.count === 1 ? "" : "s"}`
  return [`"${candidate.phrase}" (${candidate.source}; ${where}${uses})`, ...samples].join("\n")
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
