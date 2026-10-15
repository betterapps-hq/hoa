import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import { orList } from "@/text/list"
import { appliesOn, isConsidered } from "./applicability"
import { type CheckResult, evaluateCheck } from "./checks"
import { isA } from "./conditions"
import { type Answers, type Context, createContext, type Input } from "./context"
import { deriveProperty } from "./derived"
import { indexRulebook, type Override, type Overrides, overridesOn, type Rulebook } from "./overrides"
import { settledContext, settlements, unsettledReferences } from "./references"
import { createEngineVocabulary } from "./vocabulary"

// Evaluating a request (schema.md, Evaluating a request 1 to 7): every rule the request considers, on every subject
// it can apply to, to one finding each, with its remedy, its reason and every fact it read. Permissions and discretion
// rules act only through the rules they override; sanctions and limits are evaluated with violations (2.15).

export type EvaluationInput = {
  rulesFile: T.RulesFile
  request: T.EvaluationRequest
  /** What the review pipeline found: document statements, judgments and text conditions. */
  answers?: Partial<Answers>
  evaluatedAt: T.Timestamp
}

type EvaluatedRule = T.NormRule & { modality: Exclude<T.NormRule["modality"], "permission"> }

const isEvaluated = (rule: T.Rule): rule is EvaluatedRule => rule.kind === "norm" && rule.modality !== "permission"

// Outcomes that ask nothing of anyone; telling them apart doesn't change what happens (Overrides, last paragraph).
const isClear = (outcome: T.Outcome) => outcome === "met" || outcome === "exempt" || outcome === "not-applicable"

type Verdict = {
  outcome: T.Outcome
  reason: string
  check: CheckResult | null
  /** The overriding rule that decided the outcome, or whose applicability it waits on. */
  override: Override | null
  /** Missing information the check itself lacks (a document), rather than a fact deciding whether it applies. */
  isMissingFromCheck: boolean
}

const verdictOf = (outcome: T.Outcome, reason: string, details: Partial<Verdict> = {}): Verdict => ({
  outcome,
  reason,
  check: null,
  override: null,
  isMissingFromCheck: false,
  ...details
})

function subjectsOf(context: Context, rulebook: Rulebook, rule: EvaluatedRule) {
  const scratch = { ...context, reads: [] }
  const types =
    rule.appliesTo.length > 0 ? rule.appliesTo : rulebook.targetsOf(rule).flatMap((target) => target.appliesTo)
  return context.request.entities
    .filter((entity) => types.some((type) => isA(scratch, entity.id, type) !== false))
    .map((entity) => entity.id)
}

/**
 * The details a finding couldn't settle, when every one was described in words rather than given as a value (an
 * uncertain fact whose only readings are text, such as a form's "Other" answer): "location described as “by the
 * shed”". No rule can test a description and asking again gets the same words, so a person weighs it. Null when any
 * unclear detail is simply unknown or unsure.
 */
function describedOnly(context: Context): string | null {
  const unclear = context.reads.filter(
    (read) => read.state !== "known" && read.state !== "absent" && read.state !== "derived"
  )
  const described = unclear.map((read) => {
    const facts = context.facts(read.entity, read.property)
    const words = facts.flatMap((fact) =>
      fact.candidates.flatMap((candidate) => (candidate.type === "text" ? [candidate.value] : []))
    )
    // Text is a text property's value, however unsure; words are a description only of a property that takes values.
    const isDescribed =
      context.vocabulary.property(read.property)?.valueType.type !== "text" &&
      facts.length > 0 &&
      facts.every(
        (fact) =>
          fact.state === "uncertain" &&
          fact.candidates.length > 0 &&
          fact.candidates.every((candidate) => candidate.type === "text")
      )
    return isDescribed
      ? `${context.vocabulary.label(read.property)} described as ${[...new Set(words)].map((text) => `“${text}”`).join(" and ")}`
      : null
  })
  if (described.length === 0 || described.some((item) => item === null)) {
    return null
  }
  return [...new Set(described)].join(", ")
}

function verdict(
  context: Context,
  rule: EvaluatedRule,
  subject: string,
  applies: boolean | null,
  overrides: Overrides
): Verdict {
  const label = (key: T.TermKey) => context.vocabulary.label(key)
  // Whoever decides: any of the rule's deciders, the committee when it names none.
  const deciders = (keys: readonly T.TermKey[]) => orList((keys.length > 0 ? keys : ["committee"]).map(label))
  const applying = (effect: Override["effect"]) => overrides.applying.find((override) => override.effect === effect)

  const displacer = applying("displaced")
  if (displacer) {
    const reason = `${displacer.rule.title} (${displacer.rule.key}) applies instead.`
    return verdictOf("not-applicable", reason, { override: displacer })
  }
  const exemption = applying("exempt")
  if (exemption) {
    return verdictOf("exempt", `Exempt: ${exemption.rule.title} (${exemption.rule.key}).`, { override: exemption })
  }

  const check = evaluateCheck(context, rule.key, subject, rule.check)
  const unclear = context.reads
    .filter((read) => read.state !== "known" && read.state !== "absent" && read.state !== "derived")
    .map((read) => label(read.property))
  const needs = check.missing.length > 0 ? check.missing : [...new Set(unclear)]
  const described = check.missing.length > 0 ? null : describedOnly(context)
  const missingInformation = (isMissingFromCheck: boolean) =>
    described && !isMissingFromCheck
      ? verdictOf("committee", `The ${label("committee")} decides: ${rule.title}, with ${described}.`, { check })
      : verdictOf("missing-information", needs.length > 0 ? `Needs ${needs.join(", ")}.` : "Needs more information.", {
          check,
          isMissingFromCheck
        })

  return match(check.status)
    .returnType<Verdict>()
    .with("complies", () => verdictOf("met", `Meets: ${rule.title}.`, { check }))
    .with("pending", () => verdictOf("pending", "The deadline hasn't passed.", { check }))
    .with("awaiting-decision", () => {
      if (applies === null) {
        return missingInformation(false)
      }
      const by = rule.check?.type === "approval" ? rule.check.by.map(label).join(" or ") : label("committee")
      return verdictOf("committee", `Awaits the decision of the ${by}.`, { check })
    })
    .with("fails", () => {
      if (applies === null) {
        return missingInformation(false)
      }
      const discretion = applying("decided-by")
      if (discretion?.rule.kind === "discretion") {
        const reason = `Doesn't meet ${rule.title}; the ${deciders(discretion.rule.decidedBy)} decides case by case (${discretion.rule.key}).`
        return verdictOf("committee", reason, { check, override: discretion })
      }
      if (rule.modality === "recommendation") {
        return verdictOf("advisory", `Doesn't follow the recommendation: ${rule.title}.`, { check })
      }
      const contradicted = check.statements.find((statement) => statement.confirmed === false)
      const reason = contradicted ? ` The document contradicts: ${contradicted.statement}.` : ""
      return verdictOf("not-met", `Doesn't meet: ${rule.title}.${reason}`, { check })
    })
    .with("unknown", () => {
      if (rule.check?.type === "judgment") {
        return verdictOf("committee", `The ${deciders(rule.decidedBy)} decides: ${rule.check.question}`, { check })
      }
      return missingInformation(rule.check?.type === "document" && applies !== null)
    })
    .exhaustive()
}

// If it's unknown whether an overriding rule applies, and knowing would change the outcome, the finding needs the facts
// that rule reads. Outcomes that ask nothing of anyone don't count as a change.
function withUnknownOverrides(found: Verdict, overrides: Overrides): Verdict {
  if (found.outcome === "missing-information") {
    return found
  }
  const changing = overrides.unknown.find(({ effect }) => {
    const alternative = match(effect)
      .returnType<T.Outcome>()
      .with("displaced", () => "not-applicable")
      .with("exempt", () => "exempt")
      .with("decided-by", () => (found.check?.status === "fails" ? "committee" : found.outcome))
      .exhaustive()
    return alternative !== found.outcome && !(isClear(alternative) && isClear(found.outcome))
  })
  if (!changing) {
    return found
  }
  const reason = `Needs what decides whether ${changing.rule.title} (${changing.rule.key}) applies.`
  return { ...found, outcome: "missing-information", reason, override: changing, isMissingFromCheck: false }
}

const remedyOf = (rule: EvaluatedRule, found: Verdict): T.Remedy | null =>
  match(found.outcome)
    .returnType<T.Remedy | null>()
    .with("not-met", () => rule.remedy)
    .with("missing-information", () => (found.isMissingFromCheck ? "provide-document" : "provide-information"))
    .otherwise(() => null)

// The rule that changed the outcome; a rule whose applicability is only awaited changed nothing yet.
const modifiedBy = (found: Verdict): T.Finding["modifiedBy"] =>
  found.override && found.outcome !== "missing-information"
    ? [{ ruleKey: found.override.rule.key, effect: found.override.effect }]
    : []

function uniqueInputs(reads: Input[]) {
  const seen = new Set<string>()
  return reads.filter((read) => {
    const key = `${read.entity} ${read.property}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function judge(context: Context, rulebook: Rulebook, rule: EvaluatedRule, subject: string) {
  const applies = appliesOn(context, rulebook.documents, rule, subject)
  if (applies === false) {
    return verdictOf("not-applicable", "Doesn't apply here.")
  }
  const overrides = overridesOn(context, rulebook, rule, subject)
  return withUnknownOverrides(verdict(context, rule, subject, applies, overrides), overrides)
}

type Judged = { found: Verdict; reads: Input[] }

function judged(context: Context, rulebook: Rulebook, rule: EvaluatedRule, subject: string): Judged {
  const found = judge(context, rulebook, rule, subject)
  return { found, reads: [...context.reads, ...(found.override?.reads ?? [])] }
}

// Missing information that waits only on which thing an unsettled reference names is decided when every thing it could
// name gives the same outcome (Expressions 4). The finding keeps the reference's own state among its inputs.
function judgedAcrossReferences(context: Context, rulebook: Rulebook, rule: EvaluatedRule, subject: string): Judged {
  const first = judged(context, rulebook, rule, subject)
  if (first.found.outcome !== "missing-information") {
    return first
  }
  const references = unsettledReferences(context, first.reads)
  const ways = settlements(references).map((facts) => judged(settledContext(context, facts), rulebook, rule, subject))
  const [settled] = ways
  const isSame = (other: Judged) =>
    settled !== undefined &&
    other.found.outcome === settled.found.outcome &&
    other.found.override?.rule.key === settled.found.override?.rule.key
  if (!settled || settled.found.outcome === "missing-information" || !ways.every(isSame)) {
    return first
  }
  const labels = references.map(({ fact }) => context.vocabulary.label(fact.property))
  const reason = `${settled.found.reason} This holds whichever ${labels.join(" and ")} it is.`
  return { found: { ...settled.found, reason }, reads: [...first.reads, ...ways.flatMap((way) => way.reads)] }
}

export function evaluate({ rulesFile, ...input }: EvaluationInput): T.Finding[] {
  return evaluator(rulesFile)(input)
}

/**
 * Evaluates requests against one rules file, its rules indexed and its vocabulary built once for all of them: a caller
 * evaluating many requests (generated cases, one fact changed at a time) would otherwise rebuild both for each.
 */
export function evaluator(rulesFile: T.RulesFile) {
  const rulebook = indexRulebook(rulesFile)
  const vocabulary = createEngineVocabulary([...rulesFile.proposedCore, ...rulesFile.terms])
  return ({ request, answers = {}, evaluatedAt }: Omit<EvaluationInput, "rulesFile">): T.Finding[] => {
    const shared = createContext({
      vocabulary,
      request,
      settings: rulesFile.settings,
      answers: { documentReviews: [], judgments: [], conditionAnswers: [], ...answers },
      derive: deriveProperty
    })

    return rulesFile.rules
      .filter(isEvaluated)
      .filter((rule) => isConsidered(shared, rule))
      .flatMap((rule) =>
        subjectsOf(shared, rulebook, rule).map((subject): T.Finding => {
          const context: Context = { ...shared, reads: [], deriving: new Set() }
          const { found, reads } = judgedAcrossReferences(context, rulebook, rule, subject)
          return {
            ruleKey: rule.key,
            entity: subject,
            outcome: found.outcome,
            remedy: remedyOf(rule, found),
            reason: found.reason,
            inputs: uniqueInputs(reads),
            modifiedBy: modifiedBy(found),
            judgment: found.check?.judgment ?? null,
            statements: found.check?.statements ?? [],
            effects: found.check?.effects ?? [],
            sanction: null,
            asOf: request.governingDate,
            evaluatedAt
          }
        })
      )
  }
}
