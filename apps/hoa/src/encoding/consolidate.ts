import { z } from "zod"
import { compareCodeUnits } from "@/rulebook/canonical"
import { renderStatement } from "@/schema/statement"
import type { RuleKey, TermKey } from "@/schema/types"
import { validateRulebook } from "@/schema/validate"
import { createVocabulary, type Vocabulary } from "@/schema/vocabulary"
import { encodingDraft, questionDraft, ruleDraft, termDraft, type RuleContent, type TermContent } from "@/schema/zod"
import { matchLabel, similarity } from "@/text/match"
import type { MergedRulebook } from "./merge"
import { mergeLabels, uniqueCitations } from "./records"

// Consolidate (encoding.md, Consolidate): candidate pairs of near-duplicate terms and rules, one-line rule summaries for
// hoa-rulebook-consolidation, and applying its answer: duplicates merged keeping every citation, overrides added when
// precedence allows them, terms merged with every reference rewritten, conflicts turned into questions.

const ruleKeys = z.array(z.string())

/** The model's answer (encoding.md, Consolidate). */
export const consolidation = z.object({
  duplicates: z.array(z.object({ keep: z.string(), drop: ruleKeys })).default([]),
  overrides: z.array(z.object({ rule: z.string(), overrides: ruleKeys })).default([]),
  conflicts: z.array(z.object({ rules: ruleKeys, description: z.string() })).default([]),
  termMerges: z.array(z.object({ keep: z.string(), merge: ruleKeys })).default([])
})
export type Consolidation = z.input<typeof consolidation>

export type TermPair = { keys: [TermKey, TermKey]; labels: [string, string]; score: number }
export type RulePair = { keys: [RuleKey, RuleKey]; score: number }

export const consolidationProblemCodes = [
  "undefined-rule",
  "undefined-term",
  "override-not-allowed",
  "invalid-override"
] as const

export type ConsolidationProblem = {
  code: (typeof consolidationProblemCodes)[number]
  recordKey: string
  message: string
}

const ruleThreshold = 0.85

/** One line per rule: key, kind and modality, request types, subject, main citation, statement with labels. */
export function summarizeRule(rule: RuleContent, vocabulary: Pick<Vocabulary, "label">) {
  const statement = renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))
  const kind = rule.kind === "norm" || rule.kind === "sanction" ? `${rule.kind} ${rule.modality}` : rule.kind
  const citation = rule.citations[0]?.provisionKey ?? "-"
  return [rule.key, kind, rule.requestTypes.join(", "), rule.appliesTo ?? "-", citation, statement].join(" | ")
}

const scopeOf = (term: TermContent) => {
  if (term.kind === "property") {
    return `property:${term.of}`
  }
  return term.kind === "value" ? `value:${term.set}` : term.kind
}

/** Terms of the same kind (and thing, or set) whose labels match exactly or fuzzily: candidates for a merge. */
export function candidateTermPairs(terms: readonly TermContent[]): TermPair[] {
  const pairs: TermPair[] = []
  const shown = (term: TermContent) => term.labels.filter((label) => label.role !== "avoid")
  terms.forEach((a, i) => {
    for (const b of terms.slice(i + 1)) {
      if (scopeOf(a) !== scopeOf(b) || a.key === b.key) {
        continue
      }
      let best: TermPair | null = null
      for (const left of shown(a)) {
        for (const right of shown(b)) {
          const found = matchLabel(left.text, right) ?? matchLabel(right.text, left)
          if (found && found.score > (best?.score ?? 0)) {
            best = { keys: [a.key, b.key], labels: [left.text, right.text], score: found.score }
          }
        }
      }
      if (best) {
        pairs.push(best)
      }
    }
  })
  return pairs.toSorted((a, b) => b.score - a.score || compareCodeUnits(a.keys.join(), b.keys.join()))
}

/** Rules about the same subject in a shared request type whose statements read alike. */
export function candidateRulePairs(rules: readonly RuleContent[], terms: readonly TermContent[]): RulePair[] {
  const vocabulary = createVocabulary([...terms])
  const statements = rules.map((rule) =>
    renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))
  )
  const pairs: RulePair[] = []
  rules.forEach((a, i) => {
    rules.forEach((b, j) => {
      const shares = a.appliesTo === b.appliesTo && a.requestTypes.some((type) => b.requestTypes.includes(type))
      if (j <= i || !shares) {
        return
      }
      const score = similarity(statements[i] ?? "", statements[j] ?? "")
      if (score >= ruleThreshold) {
        pairs.push({ keys: [a.key, b.key], score: Math.round(score * 1000) / 1000 })
      }
    })
  })
  return pairs.toSorted((a, b) => b.score - a.score)
}

// ─── Applying the answer ────────────────────────────────────────────────────────────────────────

/** A copy with every string rewritten and repeats dropped from lists of strings, parsed back by its schema. */
function rewrite<T>(value: unknown, schema: z.ZodType<T>, change: (text: string) => string): T {
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "string") {
      return change(item)
    }
    if (Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
      return [...new Set(item.map(change))]
    }
    return item
  })
  return schema.parse(JSON.parse(json))
}

const clausesSchema = encodingDraft.shape.clauses

function rewriteAll(rulebook: MergedRulebook, change: (text: string) => string): MergedRulebook {
  return {
    ...rulebook,
    terms: rulebook.terms.map((term) => rewrite(term, termDraft, change)),
    rules: rulebook.rules.map((rule) => rewrite(rule, ruleDraft, change)),
    settings: { clauses: rewrite(rulebook.settings.clauses, clausesSchema, change) },
    questions: rulebook.questions.map((question) => ({ ...rewrite(question, questionDraft, change), id: question.id }))
  }
}

function rank(rulebook: MergedRulebook, rule: RuleContent) {
  const documentKey = rule.citations[0]?.provisionKey.split(":")[0]
  const kind = rulebook.documents.find((document) => document.key === documentKey)?.kind
  const order = rulebook.settings.clauses.precedence?.order ?? []
  const index = order.findIndex((kinds) => kind !== undefined && kinds.includes(kind))
  return index < 0 ? null : index
}

/**
 * Applies hoa-rulebook-consolidation's answer to the merged rulebook, then verifies it again. Anything the answer names
 * that doesn't exist, and overrides precedence forbids, are reported and skipped.
 */
export function applyConsolidation(merged: MergedRulebook, answer: Consolidation) {
  const result = consolidation.parse(answer)
  const problems: ConsolidationProblem[] = []
  const problem = (code: ConsolidationProblem["code"], recordKey: string, message: string) =>
    problems.push({ code, recordKey, message })
  let rulebook = structuredClone(merged)
  const findRule = (key: RuleKey) => rulebook.rules.find((rule) => rule.key === key)

  const replaced = new Map<RuleKey, RuleKey>()
  for (const { keep, drop } of result.duplicates) {
    const kept = findRule(keep)
    const dropped = drop.flatMap((key) => findRule(key) ?? [])
    if (!kept || dropped.length !== drop.length) {
      problem("undefined-rule", keep, `the duplicates of ${keep} name a rule that doesn't exist`)
      continue
    }
    kept.citations = uniqueCitations([...kept.citations, ...dropped.flatMap((rule) => rule.citations)])
    rulebook = { ...rulebook, rules: rulebook.rules.filter((rule) => !drop.includes(rule.key)) }
    for (const key of drop) {
      replaced.set(key, keep)
    }
  }
  rulebook = rewriteAll(rulebook, (text) => replaced.get(text) ?? text)

  for (const { rule: key, overrides } of result.overrides) {
    const rule = findRule(key)
    if (!rule || (rule.kind !== "norm" && rule.kind !== "discretion") || !Array.isArray(rule.overrides)) {
      problem(rule ? "invalid-override" : "undefined-rule", key, `${key} can't take a list of overridden rules`)
      continue
    }
    for (const target of overrides) {
      const overridden = findRule(target)
      const ruleRank = rank(rulebook, rule)
      const targetRank = overridden ? rank(rulebook, overridden) : null
      if (!overridden) {
        problem("undefined-rule", key, `${target} isn't a rule`)
      } else if (ruleRank !== null && targetRank !== null && ruleRank > targetRank) {
        problem("override-not-allowed", key, `${key}'s document ranks below ${target}'s, so it can't override it`)
      } else if (!rule.overrides.includes(target)) {
        rule.overrides = [...rule.overrides, target]
      }
    }
  }

  const findTerm = (key: TermKey) => rulebook.terms.find((term) => term.key === key)
  for (const { keep, merge } of result.termMerges) {
    const kept = findTerm(keep)
    const absorbed = merge.flatMap((key) => findTerm(key) ?? [])
    if (!kept || absorbed.length !== merge.length) {
      problem("undefined-term", keep, `the merge into ${keep} names a term that doesn't exist`)
      continue
    }
    mergeLabels(
      kept,
      absorbed.flatMap((term) => term.labels)
    )
    kept.citations = uniqueCitations([...kept.citations, ...absorbed.flatMap((term) => term.citations)])
    rulebook = { ...rulebook, terms: rulebook.terms.filter((term) => !merge.includes(term.key)) }
    const renamed = (text: string) => {
      const from = merge.find((key) => text === key || text.startsWith(`${key}.`))
      return from ? keep + text.slice(from.length) : text
    }
    rulebook = rewriteAll(rulebook, (text) =>
      renamed(text).replace(
        /\{\{([a-z0-9.-]+)(:plural)?\}\}/g,
        (_link, key: string, plural?: string) => `{{${renamed(key)}${plural ?? ""}}}`
      )
    )
  }

  const questions = result.conflicts.map((conflict, i) => ({
    id: `conflict-${i + 1}`,
    kind: "conflict" as const,
    question: conflict.description,
    citations: uniqueCitations(conflict.rules.flatMap((key) => findRule(key)?.citations.slice(0, 1) ?? [])),
    about: { rules: conflict.rules, terms: [] },
    options: conflict.rules.map((key) => ({ label: findRule(key)?.title ?? key, keeps: [key] })),
    answer: null
  }))
  rulebook = { ...rulebook, questions: [...rulebook.questions, ...questions] }
  return { rulebook, problems, issues: validateRulebook(rulebook) }
}
