import { match, P } from "ts-pattern"
import type { Answers } from "@/engine/context"
import { evaluator } from "@/engine/evaluate"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"
import { type Place, type Probe, probesOf } from "./probes"

// Check agreement (implementation-plan.md, Evaluation round 1): a golden rule and the pipeline rule paired with it are
// both evaluated by the engine on the same generated subjects, and the score is the share of subjects on which they
// reach the same outcome. Facts come from what each rule reads: boundary values around the constants it compares a
// path with, each listed value, other values of the set, absent and unstated. The two rules use different vocabularies,
// so facts are generated once, in the golden rule's terms where they translate, and translated for each side through the
// term alignment.

/** One side of a pair: the rule, the vocabulary it's written in and its documents. */
export type Side = { rule: T.Rule; terms: readonly T.Term[]; documents: readonly T.GoverningDocument[] }
type SideName = "reference" | "pipeline"

/** Translates term keys between the golden (reference) and pipeline vocabularies; undefined when a key has no match. */
export type KeyTranslation = {
  toPipeline: (key: T.TermKey) => T.TermKey | undefined
  toReference: (key: T.TermKey) => T.TermKey | undefined
}

/** What a probe is set to in one case; unstated is the absence of a choice. */
type Choice =
  | { kind: "value"; value: T.FactValue }
  | { kind: "absent" }
  | { kind: "link" }
  | { kind: "approval"; status: "approved" | "denied"; party: T.TermKey }
  | { kind: "document" }
  | { kind: "judgment"; answer: "yes" | "no" }
  | { kind: "text"; holds: boolean }

type JointProbe = { owner: SideName; probe: Probe; choices: Choice[] }

const governingDate = "2026-06-01"
const evaluationDate = "2026-06-15"
const evaluatedAt = "2026-06-15T12:00:00Z"
const randomCases = 48
const maxSingleUnstated = 16

// ─── Generated values ─────────────────────────────────────────────────────────────────────────────

function addDays(date: T.IsoDate, days: number) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

const numberOf = (operand: T.Operand) =>
  match(operand)
    .with({ type: "number" }, ({ value }) => value)
    .with({ type: "quantity" }, ({ value }) => value)
    .with({ type: "fraction" }, ({ numerator, denominator }) => numerator / denominator)
    .otherwise(() => null)

const unique = <V>(values: readonly V[]) => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = JSON.stringify(value)
    return seen.has(key) ? false : (seen.add(key), true)
  })
}

const valueChoice = (value: T.FactValue): Choice => ({ kind: "value", value })

/** The values a property is set to: around each constant it's compared with, else spread over its type. */
function factChoices(
  property: TermContent | undefined,
  constants: readonly T.Operand[],
  vocabulary: SideVocabulary,
  base = false
) {
  if (property?.kind !== "property") {
    return []
  }
  const numbers = constants.map(numberOf).filter((value) => value !== null)
  const term = (key: T.TermKey): T.FactValue => ({ type: "value", term: key, text: vocabulary.label(key) })
  const values = match(property.valueType)
    .returnType<Choice[]>()
    .with({ type: "quantity" }, ({ unit }) => {
      // A plain number or fraction compared with a quantity is in the property's own unit.
      const quantities = constants.flatMap((constant) => {
        const value = numberOf(constant)
        if (value === null) {
          return []
        }
        return [{ value, unit: constant.type === "quantity" ? constant.unit : unit }]
      })
      const around = quantities.flatMap((quantity) =>
        [quantity.value * 0.9, quantity.value, quantity.value * 1.1].map((value) => ({ ...quantity, value }))
      )
      const spread = around.length > 0 ? around : [0, 1, 10, 100].map((value) => ({ value, unit }))
      return spread.map((quantity) => valueChoice({ type: "quantity", ...quantity }))
    })
    .with({ type: "count" }, () => {
      const around = numbers.flatMap((value) => [Math.floor(value) - 1, Math.floor(value), Math.ceil(value) + 1])
      const spread = around.length > 0 ? around.filter((value) => value >= 0) : [0, 1, 3]
      return spread.map((value) => valueChoice({ type: "number", value }))
    })
    .with({ type: "boolean" }, () => [true, false].map((value) => valueChoice({ type: "boolean", value })))
    .with({ type: "choice" }, ({ set }) => {
      const listed = constants.flatMap((constant) => (constant.type === "value" ? [constant.term] : []))
      const others = vocabulary.values(set).filter((key) => !listed.includes(key))
      const keys = [...listed, ...others.slice(0, Math.max(1, 5 - listed.length))]
      const spread = keys.length > 0 ? keys.map(term) : [{ type: "value" as const, term: null, text: "other" }]
      return spread.map(valueChoice)
    })
    .with({ type: "date" }, () => {
      const dates = constants.flatMap((constant) => (constant.type === "date" ? [constant.value] : []))
      const around = dates.flatMap((date) => [addDays(date, -1), date, addDays(date, 1)])
      const spread = [-400, -30, -1, 0, 1, 30].map((days) => addDays(governingDate, days))
      return [...around, ...spread].map((value) => valueChoice({ type: "date", value }))
    })
    .with({ type: "date-time" }, () =>
      [-30, 0, 1].map((days) => valueChoice({ type: "date-time", value: `${addDays(governingDate, days)}T12:00:00Z` }))
    )
    .with({ type: "time-of-day" }, () => {
      const times = constants.flatMap((constant) => (constant.type === "time" ? [constant.value] : []))
      return [...times, "07:00", "12:00", "23:00"].map((value) => valueChoice({ type: "time", value }))
    })
    .with({ type: "text" }, () => [valueChoice({ type: "text", value: "stated" })])
    .with({ type: "party" }, ({ among }) => {
      const parties = [
        ...constants.flatMap((constant) => (constant.type === "value" ? [constant.term] : [])),
        ...(among ?? [])
      ]
      return parties.length > 0 ? parties.map((key) => valueChoice(term(key))) : [{ kind: "link" as const }]
    })
    .with({ type: "reference" }, () => [{ kind: "link" as const }])
    .with({ type: "schedule" }, () => [])
    .exhaustive()
  const absent: Choice[] = property.valueType.type === "boolean" ? [] : [{ kind: "absent" }]
  if (!base) {
    return unique([...values, ...absent])
  }
  // A share of nothing ("80% of the occupied residences" when none are) has no answer the text gives, so a base is
  // never zero, nor absent where silence means none.
  const zero = (choice: Choice) =>
    choice.kind === "value" &&
    (choice.value.type === "number" || choice.value.type === "quantity") &&
    choice.value.value === 0
  return unique([...values.filter((choice) => !zero(choice)), ...(property.ifUnstated === "absent" ? [] : absent)])
}

/** The vocabulary with a lookup of each value set's values. */
function sideVocabulary(terms: readonly T.Term[]) {
  const vocabulary = createVocabulary([...terms])
  const bySet = new Map<T.TermKey, T.TermKey[]>()
  for (const term of terms) {
    if (term.kind === "value") {
      bySet.set(term.set, [...(bySet.get(term.set) ?? []), term.key])
    }
  }
  return { ...vocabulary, values: (set: T.TermKey) => bySet.get(set) ?? [] }
}
type SideVocabulary = ReturnType<typeof sideVocabulary>

function choicesOf(probe: Probe, vocabulary: SideVocabulary): Choice[] {
  return match(probe)
    .returnType<Choice[]>()
    .with({ kind: "fact" }, (fact) =>
      factChoices(vocabulary.get(fact.path.at(-1) ?? ""), fact.constants, vocabulary, fact.base)
    )
    .with({ kind: "approval" }, ({ parties }) => [
      ...parties.map((party) => ({ kind: "approval" as const, status: "approved" as const, party })),
      ...parties.slice(0, 1).map((party) => ({ kind: "approval" as const, status: "denied" as const, party }))
    ])
    .with({ kind: "document" }, () => [{ kind: "document" }])
    .with({ kind: "judgment" }, () => [
      { kind: "judgment", answer: "yes" },
      { kind: "judgment", answer: "no" }
    ])
    .with({ kind: "text" }, () => [
      { kind: "text", holds: true },
      { kind: "text", holds: false }
    ])
    .exhaustive()
}

// ─── Probes in both vocabularies ──────────────────────────────────────────────────────────────────

const probeKey = (probe: Probe) =>
  match(probe)
    .with({ kind: "fact" }, (fact) => `fact ${fact.from} ${fact.path.join("/")}`)
    .with({ kind: "document" }, (document) => `document ${document.document}`)
    .with({ kind: "text" }, (text) => `text ${text.text}`)
    .otherwise((other) => other.kind)

/** A probe in the other vocabulary; null when a path step or the document has no match there. */
function translateProbe(probe: Probe, translate: (key: T.TermKey) => T.TermKey | undefined): Probe | null {
  return match(probe)
    .returnType<Probe | null>()
    .with({ kind: "fact" }, (fact) => {
      const path = fact.path.map(translate)
      if (!path.every((key) => key !== undefined)) {
        return null
      }
      const constants = fact.constants.flatMap((constant): T.Operand[] => {
        if (constant.type === "value") {
          const key = translate(constant.term)
          return key ? [{ ...constant, term: key }] : []
        }
        return [constant]
      })
      return { ...fact, path, constants }
    })
    .with({ kind: "approval" }, (approval) => ({
      kind: "approval",
      parties: approval.parties.flatMap((party) => translate(party) ?? [])
    }))
    .with({ kind: "document" }, (document) => {
      const key = translate(document.document)
      return key
        ? { ...document, document: key, signedBy: document.signedBy.flatMap((party) => translate(party) ?? []) }
        : null
    })
    .with({ kind: P.union("judgment", "text") }, (same) => same)
    .exhaustive()
}

/** The union of what both rules read, each probe in its owner's vocabulary, merged where they read the same place. */
function jointProbes(
  sides: Record<SideName, Side>,
  vocabularies: Record<SideName, SideVocabulary>,
  keys: KeyTranslation
) {
  const joint = new Map<string, { owner: SideName; probe: Probe }>()
  for (const probe of probesOf(sides.reference.rule, vocabularies.reference)) {
    joint.set(probeKey(probe), { owner: "reference", probe })
  }
  for (const probe of probesOf(sides.pipeline.rule, vocabularies.pipeline)) {
    const translated = translateProbe(probe, keys.toReference)
    const existing = translated ? joint.get(probeKey(translated)) : undefined
    if (translated && existing) {
      if (existing.probe.kind === "fact" && translated.kind === "fact") {
        existing.probe.constants.push(...translated.constants)
        existing.probe.base = Boolean(existing.probe.base || translated.base)
      } else if (existing.probe.kind === "approval" && translated.kind === "approval") {
        existing.probe.parties = [...new Set([...existing.probe.parties, ...translated.parties])]
      }
    } else if (translated) {
      joint.set(probeKey(translated), { owner: "reference", probe: translated })
    } else {
      joint.set(`pipeline ${probeKey(probe)}`, { owner: "pipeline", probe })
    }
  }
  return [...joint.values()].map(({ owner, probe }): JointProbe => ({
    owner,
    probe,
    choices: choicesOf(probe, vocabularies[owner])
  }))
}

/**
 * Whether each rule's reads can be stated in the other's vocabulary: every path translates, and every text condition
 * is the other rule's too. When they can't, facts set for one rule are invisible to the other, and the cases compare
 * vocabularies (term recall's job) rather than checks.
 */
function isComparable(
  sides: Record<SideName, Side>,
  vocabularies: Record<SideName, SideVocabulary>,
  keys: KeyTranslation
) {
  const reference = probesOf(sides.reference.rule, vocabularies.reference)
  const pipeline = probesOf(sides.pipeline.rule, vocabularies.pipeline)
  const texts = (probes: readonly Probe[]) =>
    new Set(probes.flatMap((probe) => (probe.kind === "text" ? [probe.text] : [])))
  const expressible = (
    probes: readonly Probe[],
    translate: (key: T.TermKey) => T.TermKey | undefined,
    other: Set<string>
  ) =>
    probes.every((probe) => (probe.kind === "text" ? other.has(probe.text) : translateProbe(probe, translate) !== null))
  return (
    expressible(reference, keys.toPipeline, texts(pipeline)) &&
    expressible(pipeline, keys.toReference, texts(reference))
  )
}

// ─── Cases ────────────────────────────────────────────────────────────────────────────────────────

const modulus = 2147483647

/** A seeded generator (Park and Miller's), so the same pair always gets the same cases. */
function seededRandom(seedText: string) {
  let seed = 1
  for (const char of seedText) {
    seed = (seed * 31 + char.charCodeAt(0)) % modulus
  }
  seed = seed === 0 ? 1 : seed
  return () => {
    seed = (seed * 48271) % modulus
    return (seed - 1) / (modulus - 1)
  }
}

/**
 * The cases, as one choice index per probe (-1: unstated): every combination of stated choices when there are few,
 * else a seeded sample of them; then each with one probe unstated in turn; and everything unstated.
 */
export function caseIndexes(sizes: readonly number[], seed: string) {
  const random = seededRandom(seed)
  const total = sizes.reduce((product, size) => product * Math.max(size, 1), 1)
  const stated: number[][] = []
  if (total <= randomCases) {
    for (let n = 0; n < total; n += 1) {
      let rest = n
      stated.push(
        sizes.map((size) => {
          if (size === 0) {
            return -1
          }
          const index = rest % size
          rest = Math.floor(rest / size)
          return index
        })
      )
    }
  } else {
    for (let n = 0; n < randomCases; n += 1) {
      stated.push(sizes.map((size) => (size === 0 ? -1 : Math.floor(random() * size))))
    }
  }
  const singleUnstated = sizes.slice(0, maxSingleUnstated).flatMap((size, i) => {
    const base = stated[i % stated.length]
    return size > 0 && base ? [base.map((index, j) => (j === i ? -1 : index))] : []
  })
  return unique([...stated, ...singleUnstated, sizes.map(() => -1)])
}

// ─── One side's request ───────────────────────────────────────────────────────────────────────────

const fact = (entity: string, property: T.TermKey, value: T.FactValue | null, complete: boolean | null): T.Fact => ({
  entity,
  property,
  state: value ? "known" : "absent",
  value,
  candidates: [],
  complete,
  stated: null,
  evidence: [],
  confidence: value ? 0.95 : null,
  provenance: { by: "system", at: evaluatedAt }
})

type SideContext = {
  name: SideName
  side: Side
  vocabulary: SideVocabulary
  /** From the probe owner's vocabulary to this side's; undefined when a key has no match. */
  from: (owner: SideName, key: T.TermKey) => T.TermKey | undefined
  /** A stable id for a step, the same on both sides. */
  stepId: (key: T.TermKey) => string
  requestType: T.TermKey
}

function translateValue(context: SideContext, owner: SideName, value: T.FactValue): T.FactValue {
  if (value.type === "value" && value.term !== null) {
    const term = context.from(owner, value.term)
    return term ? { ...value, term } : { ...value, term: null }
  }
  if (value.type === "quantity") {
    return { ...value, unit: context.from(owner, value.unit) ?? value.unit }
  }
  return value
}

function sideRequest(context: SideContext, probes: readonly JointProbe[], indexes: readonly number[]) {
  const { vocabulary, side } = context
  const appliesTo = side.rule.appliesTo ?? ""
  const is = (type: T.TermKey) => vocabulary.isKindOf(appliesTo, type)
  const roots: Record<T.Root, string> = {
    subject: "subject",
    request: is(context.requestType) ? "subject" : "request",
    lot: is("lot") ? "subject" : "lot",
    community: is("community") ? "subject" : "community"
  }
  const entities = new Map<string, T.EvaluationRequest["entities"][number]>()
  const addEntity = (id: string, type: T.TermKey) => {
    if (!entities.has(id)) {
      entities.set(id, { id, type, label: id, ref: null })
    }
  }
  // A subject that is a kind of the request type (a Claim, a category of dispute) is that request: the engine finds its
  // request by type and decides the category from its criteria.
  addEntity("subject", is(context.requestType) ? context.requestType : appliesTo)
  addEntity(roots.request, context.requestType)
  addEntity(roots.lot, "lot")
  addEntity(roots.community, "community")
  const facts = new Map<string, T.Fact>()
  const addFact = (item: T.Fact) => {
    const key = `${item.entity} ${item.property}`
    if (!facts.has(key)) {
      facts.set(key, item)
    }
  }
  const documents: T.EvaluationRequest["documents"] = []
  const answers: Answers = { documentReviews: [], judgments: [], conditionAnswers: [] }
  const party = (owner: SideName, key: T.TermKey) => context.from(owner, key) ?? key

  /** Links the entities along a path and returns the entity owning its last step; null when a step isn't a link. */
  function owner(place: Place) {
    let id = roots[place.from]
    for (const key of place.path.slice(0, -1)) {
      const property = vocabulary.get(key)
      if (property?.kind !== "property") {
        return null
      }
      const type = match(property.valueType)
        .with({ type: "reference" }, ({ to }) => to ?? key)
        .with({ type: "party" }, ({ among }) => among?.[0] ?? key)
        .otherwise(() => null)
      if (type === null) {
        return null
      }
      const child = `${id}>${context.stepId(key)}`
      addEntity(child, type)
      addFact(fact(id, key, { type: "entity", entity: child }, property.many ? true : null))
      id = child
    }
    return id
  }

  probes.forEach((joint, i) => {
    const choice = joint.choices[indexes[i] ?? -1]
    const probe =
      joint.owner === context.name ? joint.probe : translateProbe(joint.probe, (key) => context.from(joint.owner, key))
    if (!choice || !probe) {
      return
    }
    match([probe, choice] as const)
      .with(
        [{ kind: "fact" }, { kind: "value" }],
        [{ kind: "fact" }, { kind: "absent" }],
        [{ kind: "fact" }, { kind: "link" }],
        ([place, set]) => {
          const id = owner(place)
          const last = place.path.at(-1)
          const property = last === undefined ? undefined : vocabulary.get(last)
          if (id === null || last === undefined || property?.kind !== "property") {
            return
          }
          const complete = property.many ? true : null
          if (set.kind === "absent") {
            addFact(fact(id, last, null, complete))
          } else if (set.kind === "link") {
            const child = `${id}>${context.stepId(last)}`
            const type = property.valueType.type === "reference" ? (property.valueType.to ?? last) : last
            addEntity(child, type)
            addFact(fact(id, last, { type: "entity", entity: child }, complete))
          } else {
            addFact(fact(id, last, translateValue(context, joint.owner, set.value), complete))
          }
        }
      )
      .with([{ kind: "approval" }, { kind: "approval" }], ([, approval]) => {
        addEntity("approval", "approval")
        addFact(fact("approval", "approval.covers", { type: "entity", entity: "subject" }, null))
        const by = party(joint.owner, approval.party)
        addFact(fact("approval", "approval.by", { type: "value", term: by, text: by }, null))
        const status = `approval-status.${approval.status}`
        addFact(fact("approval", "approval.status", { type: "value", term: status, text: approval.status }, null))
        addFact(fact("approval", "approval.written", { type: "boolean", value: true }, null))
        addFact(fact("approval", "approval.on", { type: "date", value: addDays(governingDate, -10) }, null))
      })
      .with([{ kind: "document" }, { kind: "document" }], ([document]) => {
        const signers = document.signedBy.map((type) => {
          const id = `signer>${context.stepId(type)}`
          addEntity(id, type)
          return id
        })
        documents.push({
          id: `document>${documents.length}`,
          type: document.document,
          subjects: ["subject", roots.request],
          signedBy: signers
        })
      })
      .with([{ kind: "judgment" }, { kind: "judgment" }], ([, judgment]) => {
        answers.judgments.push({
          ruleKey: side.rule.key,
          entity: "subject",
          answer: judgment.answer,
          confidence: 0.95,
          rationale: "",
          evidence: []
        })
      })
      .with([{ kind: "text" }, { kind: "text" }], ([text, condition]) => {
        answers.conditionAnswers.push({ entity: "subject", text: text.text, holds: condition.holds })
      })
      .otherwise(() => undefined)
  })
  if (side.rule.kind === "norm" && side.rule.check?.type === "document" && documents.length > 0) {
    const statements = side.rule.check.mustState.map((statement) => ({ statement, confirmed: true, quote: null }))
    answers.documentReviews.push({ ruleKey: side.rule.key, entity: "subject", statements })
  }
  const request: T.EvaluationRequest = {
    organizationId: "evaluation",
    type: context.requestType,
    governingDate,
    evaluationDate,
    lot: roots.lot,
    entities: [...entities.values()],
    facts: [...facts.values()],
    documents
  }
  return { request, answers }
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Outcomes compared as what they ask of anyone: met, exempt, not applicable and no finding at all ask nothing, so they
 * count as one (the engine treats them alike when weighing overrides).
 */
export function outcomeClass(outcome: T.Outcome | "none" | "error") {
  return outcome === "met" || outcome === "exempt" || outcome === "not-applicable" || outcome === "none"
    ? "clear"
    : outcome
}

/** Whether a rule is one the engine evaluates on its own: a norm other than a permission, with a subject type. */
const isEvaluated = (rule: T.Rule) => rule.kind === "norm" && rule.modality !== "permission" && rule.appliesTo !== null

function isolated(rule: T.Rule): T.Rule {
  return rule.kind === "norm" || rule.kind === "discretion" ? { ...rule, overrides: [] } : rule
}

export type CheckAgreement = {
  reference: T.RuleKey
  pipeline: T.RuleKey
  /** Whether both rules' reads translate into the other's vocabulary (isComparable). */
  isComparable: boolean
  cases: number
  agreeing: number
  /** A few disagreeing cases, by outcome on each side. */
  examples: { reference: string; pipeline: string }[]
}

/**
 * Evaluates both rules of a pair on generated subjects and counts the cases with the same outcome; null when neither
 * rule is one the engine evaluates on its own (permissions, discretion, sanctions, limits).
 */
export function checkAgreement(input: {
  reference: Side
  pipeline: Side
  keys: KeyTranslation
  settings: T.Settings
}): CheckAgreement | null {
  const sides: Record<SideName, Side> = { reference: input.reference, pipeline: input.pipeline }
  if (!isEvaluated(sides.reference.rule) && !isEvaluated(sides.pipeline.rule)) {
    return null
  }
  const vocabularies: Record<SideName, SideVocabulary> = {
    reference: sideVocabulary(sides.reference.terms),
    pipeline: sideVocabulary(sides.pipeline.terms)
  }
  const { keys } = input
  const probes = jointProbes(sides, vocabularies, keys)
  const pipelineTypes = sides.pipeline.rule.requestTypes.flatMap((type) => keys.toReference(type) ?? [])
  const requestType =
    sides.reference.rule.requestTypes.find((type) => pipelineTypes.includes(type)) ??
    sides.reference.rule.requestTypes[0] ??
    ""
  const contexts: Record<SideName, SideContext> = {
    reference: {
      name: "reference",
      side: sides.reference,
      vocabulary: vocabularies.reference,
      from: (owner, key) => (owner === "reference" ? key : keys.toReference(key)),
      stepId: (key) => key,
      requestType
    },
    pipeline: {
      name: "pipeline",
      side: sides.pipeline,
      vocabulary: vocabularies.pipeline,
      from: (owner, key) => (owner === "pipeline" ? key : keys.toPipeline(key)),
      stepId: (key) => keys.toReference(key) ?? `pipeline~${key}`,
      requestType: keys.toPipeline(requestType) ?? requestType
    }
  }
  // Every case evaluates each side's rules file, so each is indexed and its vocabulary built once.
  const evaluatorOf = (side: Side) =>
    evaluator({
      organization: { id: "evaluation", name: "Evaluation" },
      documents: [...side.documents],
      provisions: [],
      terms: [...side.terms],
      proposedCore: [],
      rules: [isolated(side.rule)],
      settings: input.settings,
      questions: []
    })
  const evaluators: Record<SideName, ReturnType<typeof evaluator>> = {
    reference: evaluatorOf(sides.reference),
    pipeline: evaluatorOf(sides.pipeline)
  }
  const outcome = (name: SideName, indexes: readonly number[]) => {
    const { rule } = sides[name]
    const { request, answers } = sideRequest(contexts[name], probes, indexes)
    try {
      const findings = evaluators[name]({ request, answers, evaluatedAt })
      return findings.find((finding) => finding.ruleKey === rule.key && finding.entity === "subject")?.outcome ?? "none"
    } catch {
      return "error"
    }
  }

  const cases = caseIndexes(
    probes.map((probe) => probe.choices.length),
    `${sides.reference.rule.key} ${sides.pipeline.rule.key}`
  )
  const examples: CheckAgreement["examples"] = []
  let agreeing = 0
  for (const indexes of cases) {
    const reference = outcome("reference", indexes)
    const pipeline = outcome("pipeline", indexes)
    if (outcomeClass(reference) === outcomeClass(pipeline)) {
      agreeing += 1
    } else if (examples.length < 3) {
      examples.push({ reference, pipeline })
    }
  }
  return {
    reference: sides.reference.rule.key,
    pipeline: sides.pipeline.rule.key,
    isComparable: isComparable(sides, vocabularies, keys),
    cases: cases.length,
    agreeing,
    examples
  }
}
