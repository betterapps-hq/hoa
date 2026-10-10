import { indexRulebook } from "@/engine/overrides"
import type * as T from "@/schema/types"
import { rulebookVocabulary, rulesInRequestType } from "./documentTypes"

// Rule selection (application-review.md, Select): code, from the rules file. The rules in the request type in force on
// the governing date whose subject is among the request's entities, then every rule that overrides a selected one, to
// a fixed point. Rules borne by the committee or the board stay in; the decision never counts them.

export type SelectionInput = {
  type: T.TermKey
  governingDate: T.IsoDate
  /** The types of the request's entities, the request, lot and community included. */
  entityTypes: readonly T.TermKey[]
  /** The lot's id outside the file, for decision rules scoped to one lot. */
  lotRef: string | null
  /**
   * The passages the application form's questions cite: a question's citations are what its answer is checked
   * against, so the rules that cite one are selected whatever the request's entities.
   */
  cited?: readonly T.ProvisionKey[]
}

export function selectRules(rulesFile: T.RulesFile, input: SelectionInput): T.RuleKey[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  const rulebook = indexRulebook(rulesFile)
  const considered = rulesInRequestType(rulesFile, input.type).filter((rule) =>
    rule.scope ? rule.scope.lotId === input.lotRef : rule.effectiveFrom <= input.governingDate
  )
  const consideredKeys = new Set(considered.map((rule) => rule.key))
  const types = new Set(input.entityTypes.map((type) => vocabulary.thingOf(type)))

  const cited = new Set(input.cited ?? [])
  const selected = new Set(
    considered
      .filter(
        (rule) =>
          (rule.appliesTo !== null && types.has(vocabulary.thingOf(rule.appliesTo))) ||
          rule.citations.some((citation) => cited.has(citation.provisionKey))
      )
      .map((rule) => rule.key)
  )
  const queue = considered.filter((rule) => selected.has(rule.key))
  for (let rule = queue.shift(); rule; rule = queue.shift()) {
    for (const overrider of rulebook.overridersOf(rule)) {
      if (consideredKeys.has(overrider.key) && !selected.has(overrider.key)) {
        selected.add(overrider.key)
        queue.push(overrider)
      }
    }
  }
  return considered.filter((rule) => selected.has(rule.key)).map((rule) => rule.key)
}

/** The rules file with only the selected rules, which is what the review evaluates. */
export function selectedRulesFile(rulesFile: T.RulesFile, selected: readonly T.RuleKey[]): T.RulesFile {
  const keys = new Set(selected)
  return { ...rulesFile, rules: rulesFile.rules.filter((rule) => keys.has(rule.key)) }
}
