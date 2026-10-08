import type {
  Component,
  ConditionAnswer,
  DocumentStatus,
  Evidence,
  Fact,
  Finding,
  FindingStatus
} from "@/review/reviewModel"
import { getAttribute, type Attribute, type ProjectTypeId } from "@/rules/catalog"
import type { AllowedValue, Check, Condition, Rule } from "@/rules/rule"

// Code checks facts against typed rules (docs/design/review.md, "7. Evaluate"). Models never decide these outcomes;
// they only answer qualitative checks and text conditions, which arrive here as inputs.

export type QualitativeResult = { status: "met" | "not-met" | "unclear"; explanation: string; evidence: Evidence[] }

export type EvaluationInput = {
  projectType: ProjectTypeId
  rules: readonly Rule[]
  components: readonly Component[]
  facts: readonly Fact[]
  conditionAnswers: readonly ConditionAnswer[]
  documents: readonly DocumentStatus[]
  /** Results of the qualitative model calls, keyed by `qualitativeKey`. A missing entry means the call failed. */
  qualitative?: ReadonlyMap<string, QualitativeResult>
}

type Outcome = {
  status: FindingStatus
  explanation: string
  evidence: Evidence[]
  documentProblems?: Finding["documentProblems"]
}

type Read =
  | { kind: "value"; value: string | number | boolean; fact: Fact }
  | { kind: "none" }
  | { kind: "missing"; isRequired: boolean }
  | { kind: "conflicting"; fact: Fact }
  | { kind: "uncertain"; fact: Fact }

type ConditionResult = "true" | "false" | "not-applicable" | "unclear" | "committee"

export function qualitativeKey(ruleId: string, componentId: string | null) {
  return `${ruleId}:${componentId ?? "project"}`
}

export function normalize(value: string | number | boolean) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ")
}

function matchesAllowed(value: string | number | boolean, allowed: AllowedValue) {
  const target = normalize(value)
  return [allowed.value, ...allowed.aliases].some((candidate) => normalize(candidate) === target)
}

function listValues(values: readonly AllowedValue[]) {
  return values.map((value) => value.value).join(", ")
}

/** Reads facts for one component, following the catalog's scopes, presence attributes and requirements. */
function createReader(input: EvaluationInput, component: Component | null) {
  const findFact = (attribute: string, componentId: string | null) =>
    input.facts.find((fact) => fact.attribute === attribute && fact.componentId === componentId)

  const componentIdFor = (attribute: Attribute): string | null | undefined => {
    if (attribute.scope === "project") {
      return null
    }
    if (component && attribute.scope === component.kind) {
      return component.id
    }
    // A gate rule reading segment attributes reads its own segment.
    if (component?.kind === "gate" && attribute.scope === "segment") {
      const segment = findFact("gate.segmentId", component.id)
      return typeof segment?.value === "string" ? segment.value : undefined
    }
    return undefined
  }

  const read = (key: string): Read => {
    const attribute = getAttribute(input.projectType, key)
    if (!attribute) {
      return { kind: "missing", isRequired: false }
    }
    const componentId = componentIdFor(attribute)
    if (componentId === undefined) {
      return { kind: "missing", isRequired: false }
    }
    if (attribute.presence) {
      const presence = findFact(attribute.presence, componentId)
      if (presence?.value === false && (presence.status === "stated" || presence.status === "inferred")) {
        return { kind: "none" }
      }
    }
    const fact = findFact(key, componentId)
    if (fact?.status === "none") {
      return { kind: "none" }
    }
    if (fact?.status === "conflicting") {
      return { kind: "conflicting", fact }
    }
    if (!fact || fact.status === "not-provided" || fact.value === null) {
      return { kind: "missing", isRequired: isRequired(attribute) }
    }
    if (fact.valueMatch === "uncertain") {
      return { kind: "uncertain", fact }
    }
    return { kind: "value", value: fact.value, fact }
  }

  const isRequired = (attribute: Attribute): boolean => {
    const requirement = attribute.isRequiredForReview
    if (typeof requirement === "boolean") {
      return requirement
    }
    const condition = read(requirement.when)
    return condition.kind === "value" && requirement.in.some((value) => normalize(value) === normalize(condition.value))
  }

  return { read }
}

function label(projectType: ProjectTypeId, key: string) {
  return getAttribute(projectType, key)?.label ?? key
}

function factEvidence(...reads: Read[]) {
  return reads.flatMap((read) => ("fact" in read ? read.fact.evidence : []))
}

/** The outcome when a value can't be read: absent features don't apply, missing ones are asked for or flagged. */
function unreadable(read: Exclude<Read, { kind: "value" }>, name: string): Outcome {
  switch (read.kind) {
    case "none":
      return { status: "not-applicable", explanation: `${name} isn't part of this project.`, evidence: [] }
    case "missing":
      return read.isRequired
        ? { status: "unclear", explanation: `${name} isn't given.`, evidence: [] }
        : {
            status: "needs-committee",
            explanation: `${name} isn't given; the committee should confirm it.`,
            evidence: []
          }
    case "conflicting":
      return {
        status: "unclear",
        explanation: `The packet gives conflicting values for ${name}.`,
        evidence: read.fact.evidence
      }
    case "uncertain":
      return {
        status: "unclear",
        explanation: `${name} "${read.fact.rawValue ?? read.fact.value}" doesn't clearly match a listed value; confirm the product name.`,
        evidence: read.fact.evidence
      }
  }
}

function isUnlisted(read: Extract<Read, { kind: "value" }>) {
  return read.fact.valueMatch === "unlisted"
}

function evaluateCondition(
  condition: Condition,
  reader: ReturnType<typeof createReader>,
  answers: readonly ConditionAnswer[],
  componentId: string | null
): ConditionResult {
  if (condition.type === "text") {
    const answer =
      answers.find((item) => item.conditionId === condition.id && item.componentId === componentId) ??
      answers.find((item) => item.conditionId === condition.id && item.componentId === null)
    if (answer?.answer === "true" || answer?.answer === "false") {
      return answer.answer
    }
    return "committee"
  }
  const read = reader.read(condition.attribute)
  if (read.kind === "none") {
    return "not-applicable"
  }
  if (read.kind === "missing") {
    return read.isRequired ? "unclear" : "committee"
  }
  if (read.kind === "conflicting" || read.kind === "uncertain") {
    return "unclear"
  }
  const value = normalize(read.value)
  const expected = Array.isArray(condition.value) ? condition.value.map(normalize) : [normalize(condition.value ?? "")]
  switch (condition.operator) {
    case "exists":
      return "true"
    case "equals":
      return value === expected[0] ? "true" : "false"
    case "in":
      return expected.includes(value) ? "true" : "false"
    case "not-in":
      return expected.includes(value) ? "false" : "true"
  }
}

function evaluateConditions(conditions: readonly Condition[], evaluate: (condition: Condition) => ConditionResult) {
  const results = conditions.map(evaluate)
  if (results.includes("false") || results.includes("not-applicable")) {
    return "not-applicable" as const
  }
  if (results.includes("unclear")) {
    return "unclear" as const
  }
  if (results.includes("committee")) {
    return "committee" as const
  }
  return "applies" as const
}

function evaluateCheck(
  check: Exclude<Check, { type: "informational" | "qualitative" }>,
  input: EvaluationInput,
  reader: ReturnType<typeof createReader>,
  componentId: string | null
): Outcome {
  const name = (key: string) => label(input.projectType, key)
  switch (check.type) {
    case "allowed-values": {
      const read = reader.read(check.attribute)
      if (read.kind !== "value") {
        return unreadable(read, name(check.attribute))
      }
      const isAllowed = !isUnlisted(read) && check.values.some((allowed) => matchesAllowed(read.value, allowed))
      if (isAllowed) {
        return {
          status: "met",
          explanation: `${name(check.attribute)} is ${read.value}.`,
          evidence: read.fact.evidence
        }
      }
      return {
        status: check.otherwise === "committee" ? "needs-committee" : "not-met",
        explanation: `${name(check.attribute)} is ${read.value}; the listed values are ${listValues(check.values)}.`,
        evidence: read.fact.evidence
      }
    }
    case "allowed-values-by": {
      const key = reader.read(check.keyAttribute)
      if (key.kind !== "value") {
        return unreadable(key, name(check.keyAttribute))
      }
      const row = isUnlisted(key) ? undefined : check.table.find((entry) => matchesAllowed(key.value, entry.key))
      if (!row) {
        return {
          status: check.unknownKey === "committee" ? "needs-committee" : "not-met",
          explanation: `${name(check.keyAttribute)} ${key.value} isn't one of ${check.table.map((entry) => entry.key.value).join(", ")}.`,
          evidence: key.fact.evidence
        }
      }
      const read = reader.read(check.attribute)
      if (read.kind !== "value") {
        return unreadable(read, name(check.attribute))
      }
      const isAllowed = !isUnlisted(read) && row.values.some((allowed) => matchesAllowed(read.value, allowed))
      return {
        status: isAllowed ? "met" : "not-met",
        explanation: isAllowed
          ? `${name(check.attribute)} ${read.value} is listed for ${row.key.value}.`
          : `${name(check.attribute)} ${read.value} isn't listed for ${row.key.value}; the listed values are ${listValues(row.values)}.`,
        evidence: factEvidence(key, read)
      }
    }
    case "prohibited-values": {
      const read = reader.read(check.attribute)
      if (read.kind !== "value") {
        return unreadable(read, name(check.attribute))
      }
      const isProhibited = !isUnlisted(read) && check.values.some((value) => matchesAllowed(read.value, value))
      return {
        status: isProhibited ? "not-met" : "met",
        explanation: isProhibited
          ? `${name(check.attribute)} is ${read.value}, which isn't allowed.`
          : `${name(check.attribute)} is ${read.value}.`,
        evidence: read.fact.evidence
      }
    }
    case "range": {
      const reads = check.attributes.map((attribute) => ({ attribute, read: reader.read(attribute) }))
      // An absent feature counts as 0 in a sum, but a range over nothing but absent features doesn't apply.
      if (reads.every(({ read }) => read.kind === "none")) {
        return unreadable({ kind: "none" }, name(check.attributes[0] ?? ""))
      }
      let total = 0
      for (const { attribute, read } of reads) {
        if (read.kind === "none") {
          continue
        }
        if (read.kind !== "value") {
          return unreadable(read, name(attribute))
        }
        const number = Number(read.value)
        if (!Number.isFinite(number)) {
          return {
            status: "unclear",
            explanation: `${name(attribute)} "${read.value}" isn't a number.`,
            evidence: read.fact.evidence
          }
        }
        total += number
      }
      const unit = getAttribute(input.projectType, check.attributes[0] ?? "")?.unit ?? ""
      const subject =
        check.attributes.length > 1
          ? `The total of ${check.attributes.map(name).join(" and ")}`
          : name(check.attributes[0] ?? "")
      const evidence = factEvidence(...reads.map(({ read }) => read))
      if (check.min !== null && total < check.min) {
        return {
          status: "not-met",
          explanation: `${subject} is ${total} ${unit}, below the minimum of ${check.min}.`,
          evidence
        }
      }
      if (check.max !== null && total > check.max) {
        return {
          status: "not-met",
          explanation: `${subject} is ${total} ${unit}, above the maximum of ${check.max}.`,
          evidence
        }
      }
      return { status: "met", explanation: `${subject} is ${total} ${unit}.`.replace(/ \./, "."), evidence }
    }
    case "matches": {
      const first = reader.read(check.attribute)
      if (first.kind !== "value") {
        return unreadable(first, name(check.attribute))
      }
      const second = reader.read(check.otherAttribute)
      if (second.kind !== "value") {
        return unreadable(second, name(check.otherAttribute))
      }
      const isMatch = normalize(first.value) === normalize(second.value)
      return {
        status: isMatch ? "met" : "not-met",
        explanation: isMatch
          ? `${name(check.attribute)} matches (${first.value}).`
          : `${name(check.attribute)} is ${first.value} but ${name(check.otherAttribute)} is ${second.value}.`,
        evidence: factEvidence(first, second)
      }
    }
    case "required-fact": {
      const read = reader.read(check.attribute)
      if (read.kind === "value") {
        return { status: "met", explanation: `${name(check.attribute)} is given.`, evidence: read.fact.evidence }
      }
      const outcome = unreadable(read, name(check.attribute))
      return outcome.status === "needs-committee" ? { ...outcome, status: "unclear" } : outcome
    }
    case "required-document": {
      const status =
        input.documents.find((item) => item.requirement === check.document && item.componentId === componentId) ??
        input.documents.find((item) => item.requirement === check.document && item.componentId === null)
      if (status?.status === "present" && status.problems.length === 0) {
        return { status: "met", explanation: "The document is provided.", evidence: status.evidence }
      }
      const problems = status?.problems ?? []
      const state = status ? status.status : "missing"
      return {
        status: "unclear",
        explanation: `The document is ${state}${problems.length > 0 ? ` (${problems.join(", ")})` : ""}.`,
        evidence: status?.evidence ?? [],
        documentProblems: problems
      }
    }
  }
}

/** A failure the committee should weigh rather than an objective violation. */
function isSoftRule(rule: Rule) {
  return rule.obligation === "recommended" || rule.discretion === "committee"
}

function downgrade(rule: Rule, outcome: Outcome): Outcome {
  if (outcome.status === "not-met" && (isSoftRule(rule) || rule.exceptions.length > 0)) {
    const reason = isSoftRule(rule)
      ? "the committee decides this rule"
      : `exceptions may apply: ${rule.exceptions.join("; ")}`
    return { ...outcome, status: "needs-committee", explanation: `${outcome.explanation} Not met, but ${reason}.` }
  }
  if (outcome.status === "unclear" && isSoftRule(rule)) {
    return { ...outcome, status: "needs-committee" }
  }
  return outcome
}

/** A model's qualitative judgment only ever confirms a rule; anything else goes to the committee. */
function qualitativeOutcome(result: QualitativeResult | undefined): Outcome {
  if (!result) {
    return {
      status: "needs-committee",
      explanation: "Automatic check failed; the committee should judge it.",
      evidence: []
    }
  }
  return {
    status: result.status === "met" ? "met" : "needs-committee",
    explanation: result.explanation,
    evidence: result.evidence
  }
}

function componentsFor(rule: Rule, components: readonly Component[]): (Component | null)[] {
  return rule.appliesTo === "project" ? [null] : components.filter((component) => component.kind === rule.appliesTo)
}

/** The qualitative checks that apply, so the workflow can make one model call for each before evaluating. */
export function planQualitativeChecks(input: EvaluationInput) {
  return input.rules.flatMap((rule) => {
    if (rule.check.type !== "qualitative") {
      return []
    }
    return componentsFor(rule, input.components).flatMap((component) => {
      const reader = createReader(input, component)
      const componentId = component?.id ?? null
      const applies = evaluateConditions(rule.appliesWhen, (condition) =>
        evaluateCondition(condition, reader, input.conditionAnswers, componentId)
      )
      return applies === "applies" ? [{ rule, componentId }] : []
    })
  })
}

/** One finding per applicable rule and component. Informational rules produce no findings. */
export function evaluateRules(input: EvaluationInput): Finding[] {
  return input.rules.flatMap((rule) => {
    const check = rule.check
    if (check.type === "informational") {
      return []
    }
    return componentsFor(rule, input.components).map((component): Finding => {
      const componentId = component?.id ?? null
      const reader = createReader(input, component)
      const applies = evaluateConditions(rule.appliesWhen, (condition) =>
        evaluateCondition(condition, reader, input.conditionAnswers, componentId)
      )
      let outcome: Outcome
      if (applies === "not-applicable") {
        outcome = { status: "not-applicable", explanation: "The rule doesn't apply here.", evidence: [] }
      } else if (applies === "unclear") {
        outcome = {
          status: "unclear",
          explanation: "Whether the rule applies depends on information that's missing or conflicting.",
          evidence: []
        }
      } else if (applies === "committee") {
        outcome = {
          status: "needs-committee",
          explanation: "Whether the rule applies is for the committee to judge.",
          evidence: []
        }
      } else if (check.type === "qualitative") {
        outcome = qualitativeOutcome(input.qualitative?.get(qualitativeKey(rule.id, componentId)))
      } else {
        outcome = downgrade(rule, evaluateCheck(check, input, reader, componentId))
      }
      return {
        id: `${rule.id}:${componentId ?? "project"}`,
        ruleId: rule.id,
        componentId,
        status: outcome.status,
        explanation: outcome.explanation,
        evidence: outcome.evidence,
        documentProblems: outcome.documentProblems ?? [],
        decidedBy: check.type === "qualitative" && applies === "applies" ? "model" : "code"
      }
    })
  })
}
