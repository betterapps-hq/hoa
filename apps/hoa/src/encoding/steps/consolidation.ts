import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { compareCodeUnits } from "@/rulebook/canonical"
import { renderStatement } from "@/schema/statement"
import type { DocumentKind, GoverningDocument, ProvisionKey, RuleKey } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import type { RuleContent, TermContent } from "@/schema/zod"
import { candidateRulePairs } from "../consolidate"
import { documentLine } from "../promptVariables"
import { keyEnum } from "./drafts"
import type { UnresolvedTarget } from "./outline"
import type { stepPrompts } from "./prompts"

// Consolidation over the merged rules (hoa-rulebook-consolidation, prompt drafts v2): each rule line shows its
// existing overrides, code lists the cross-references between sections (and the targets E named that resolved to no
// rule) and the similar pairs it found, and term merges are gone (C-merge does them before any rule is drafted). Only a
// norm or discretion rule whose overrides is a list can take more; code applies the answer (applyConsolidation).

/**
 * Consolidation's answer for a build (one call, so its rule keys are build-wide enums): only a norm or discretion whose
 * overrides is a list can take more overrides.
 */
export function consolidationAnswer(rules: readonly RuleContent[]) {
  const key = keyEnum(rules.map((rule) => rule.key))
  const listed = keyEnum(
    rules.flatMap((rule) =>
      (rule.kind === "norm" || rule.kind === "discretion") && Array.isArray(rule.overrides) ? [rule.key] : []
    )
  )
  return z.object({
    duplicates: z.array(z.object({ keep: key, drop: z.array(key).min(1) })),
    overrides: z.array(z.object({ rule: listed, overrides: z.array(key).min(1), why: z.string().min(1) })),
    conflicts: z.array(z.object({ rules: z.array(key).min(2), description: z.string().min(1) }))
  })
}
const mainCitation = (rule: RuleContent) => rule.citations[0]?.provisionKey ?? "-"

/** A rule's existing overrides: none, the keys, or "selector"; "-" for a kind that can't override. */
function overridesText(rule: RuleContent) {
  if (rule.kind !== "norm" && rule.kind !== "discretion") {
    return "-"
  }
  return Array.isArray(rule.overrides) ? rule.overrides.join(", ") || "none" : "selector"
}

/** One rule line: key | kind and modality | request types | subject | main citation | overrides | statement. */
export function ruleLine(rule: RuleContent, vocabulary: ReturnType<typeof createVocabulary>) {
  const kind = rule.kind === "norm" || rule.kind === "sanction" ? `${rule.kind} ${rule.modality}` : rule.kind
  const overrides = overridesText(rule)
  const statement = renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))
  return [
    rule.key,
    kind,
    rule.requestTypes.join(", "),
    rule.appliesTo ?? "-",
    mainCitation(rule),
    overrides,
    statement
  ].join(" | ")
}

/**
 * Rules whose provisions refer to a provision in another section, with the rules main-cited there: rule | refers to
 * provision | rules main-cited there. Targets E named that resolved to nothing are listed as "nothing resolved".
 */
export function crossReferenceLines(input: {
  rules: readonly RuleContent[]
  references: ReadonlyMap<ProvisionKey, readonly ProvisionKey[]>
  sectionOf: (provisionKey: ProvisionKey) => string | undefined
  unresolved?: readonly UnresolvedTarget[]
}) {
  const citedAt = new Map<ProvisionKey, RuleKey[]>()
  for (const rule of input.rules) {
    citedAt.set(mainCitation(rule), [...(citedAt.get(mainCitation(rule)) ?? []), rule.key])
  }
  const lines: string[] = []
  for (const rule of input.rules) {
    const section = input.sectionOf(mainCitation(rule))
    const referred = new Set(rule.citations.flatMap((citation) => input.references.get(citation.provisionKey) ?? []))
    for (const target of [...referred].toSorted(compareCodeUnits)) {
      const targets = citedAt.get(target) ?? []
      if (input.sectionOf(target) !== section && targets.length > 0) {
        lines.push(`${rule.key} | ${target} | ${targets.join(", ")}`)
      }
    }
  }
  for (const item of input.unresolved ?? []) {
    lines.push(`${item.key} | ${item.target} | nothing resolved`)
  }
  return lines
}

/** The precedence of document kinds as a rank, highest first, when the settings give one. */
function rankOf(kind: DocumentKind, order: readonly (readonly DocumentKind[])[]) {
  const index = order.findIndex((kinds) => kinds.includes(kind))
  return index < 0 ? order.length : index
}

/** The drafted consolidation's variables. */
export function consolidationVariables(input: {
  rules: readonly RuleContent[]
  terms: readonly TermContent[]
  documents: readonly Pick<GoverningDocument, "key" | "kind" | "title" | "edition">[]
  precedence: readonly (readonly DocumentKind[])[]
  crossReferences: readonly string[]
}): PromptVariables<typeof stepPrompts.consolidation> {
  const vocabulary = createVocabulary([...input.terms])
  const pairs = candidateRulePairs(input.rules, input.terms)
  return {
    documents: input.documents
      .toSorted(
        (a, b) => rankOf(a.kind, input.precedence) - rankOf(b.kind, input.precedence) || compareCodeUnits(a.key, b.key)
      )
      .map(documentLine)
      .join("\n"),
    crossReferences: input.crossReferences.join("\n") || "none",
    rulePairs: pairs.map((pair) => `${pair.keys[0]} | ${pair.keys[1]} | ${pair.score}`).join("\n") || "none",
    rules: input.rules
      .toSorted((a, b) => compareCodeUnits(a.key, b.key))
      .map((rule) => ruleLine(rule, vocabulary))
      .join("\n")
  }
}
