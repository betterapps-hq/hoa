import { getDb } from "@/db/client.server"
import { accountNames, getRoll } from "@/db/peopleRepository"
import { getPublishedRulesFile, getRulesFileOf } from "@/db/rulebookContentRepository"
import { getViolationRecords, listViolationIds, violationHistory, type ViolationRecord } from "@/db/violationRepository"
import type { CurePeriod, SanctionResult } from "@/engine/sanctions"
import { doesWorkOf } from "@/features/role/roles"
import { citationIndex, citationLabel, referencedRule } from "@/features/rulebook/rulebookRecords"
import type { ReferencedRule } from "@/features/rulebook/RuleReference/RuleReference"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import { isCurrent } from "@/people/people"
import type { RollData } from "@/people/roll"
import { addressLine } from "@/places/address"
import { rulebookVocabulary } from "@/review/documentTypes"
import { localDate } from "@/review/load"
import { readRulesFile } from "@/rulebook/assemble"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import type { RequestContext } from "@/session/requestContext.server"
import { getBucket } from "@/storage/storage.server"
import {
  evaluateViolation,
  recordedProperties,
  stepsToMeet,
  type ProcedureStep,
  type ViolationCase
} from "@/violations/evaluation"
import {
  detailsOf,
  imposedBySanction,
  statedFacts,
  stepDates,
  type FactValue,
  type NoticeDelivery,
  type EventKind,
  type ViolationParty,
  type ViolationStatus
} from "@/violations/violation"

// Loading violations for the people who may see them, with the rulebook each cites, and what the documents allow.

/** A rule as a violation's page shows it: its title, its statement in words, and its citations. */
export type ViolationRule = { key: T.RuleKey; title: string; statement: string; reference: ReferencedRule }

export type SanctionView = Omit<SanctionResult, "inputs" | "precondition"> & {
  rule: ViolationRule
  /** What's been imposed under it for this violation already, in cents. */
  imposedCents: number
  /** Its parties, the body that imposes it and the privileges it suspends, in words. */
  labels: { against: string[]; imposedBy: string[]; suspends: string[] }
  /**
   * When it waits on a procedure the documents require first: the board's steps that would meet it, or null when its
   * steps can't (it turns on something else). Null when it doesn't wait on one.
   */
  procedure: { steps: ProcedureStep[] | null } | null
}

/** An event as the page shows it: its kind, day and note, and what its kind records. */
export type EventView = {
  id: string
  kind: EventKind
  occurredOn: string
  note: string | null
  by: string
  delivery: NoticeDelivery | null
  hearing: { on: string; place: string | null } | null
  curedInTime: boolean | null
  sanction: { title: string; type: string; amountCents: number | null } | null
  /** A fact the board stated: its name, and its value in words (null when taken back). */
  fact: { label: string; value: string | null } | null
}

/** How the board answers a fact: the input its value type takes. */
export type FactInput =
  | { type: "date" }
  | { type: "boolean" }
  | { type: "number" }
  | { type: "quantity"; unit: T.TermKey; unitLabel: string }
  | { type: "choice"; options: { term: T.TermKey; label: string }[] }

/** A fact the documents ask about a violation that only the board can say, such as the day it set to cure by. */
export type FactQuestion = {
  key: T.TermKey
  label: string
  /** What the documents mean by it. */
  note: string | null
  input: FactInput
  value: FactValue | null
  /** Its value in words; null while unanswered. */
  valueText: string | null
}

export type ViolationView = {
  violation: { id: string; title: string; description: string | null; observedOn: string; status: ViolationStatus }
  association: string
  unit: { id: string; label: string; address: string | null }
  people: { personId: string; name: string; party: ViolationParty; email: string | null }[]
  rules: ViolationRule[]
  photos: { id: string; url: string; fileName: string }[]
  events: EventView[]
  steps: ReturnType<typeof stepDates>
  today: string
  cures: CurePeriod[]
  /** The time to cure as a notice sent today would start it. */
  curesFromNotice: CurePeriod[]
  /** What the board may impose; empty for an owner. */
  sanctions: SanctionView[]
  /** The facts the documents need that the board answers, the unanswered first; empty for an owner. */
  facts: FactQuestion[]
  canManage: boolean
  canRespond: boolean
}

/** Today in the association's time zone, as its rulebook sets it. */
export const todayIn = (rulesFile: T.RulesFile | null) =>
  localDate(new Date().toISOString(), rulesFile?.settings.clauses.time.zone ?? "UTC")

/** The rules files violations cite, read once each. */
export function rulesFiles(organizationId: string) {
  const files = new Map<string, Promise<T.RulesFile>>()
  return (rulebookId: string) => {
    const cached = files.get(rulebookId)
    if (cached) {
      return cached
    }
    const loading = (async () => {
      const ref = await getRulesFileOf(getDb(), organizationId, rulebookId)
      if (!ref) {
        throw new Error("The rulebook this violation cites can't be read.")
      }
      return readRulesFile(getBucket(), ref)
    })()
    files.set(rulebookId, loading)
    return loading
  }
}

/** The published rulebook's rules file, with its id; null before one is published. */
export async function publishedRules(organizationId: string) {
  const published = await getPublishedRulesFile(getDb(), organizationId)
  return published ? { id: published.rulebookId, rulesFile: await readRulesFile(getBucket(), published) } : null
}

/** A rule in words, with its citations. */
export function ruleViewOf(rulesFile: T.RulesFile, rule: T.Rule): ViolationRule {
  const vocabulary = rulebookVocabulary(rulesFile)
  return {
    key: rule.key,
    title: rule.title,
    statement: renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural)),
    reference: referencedRule(citationIndex(rulesFile), rule)
  }
}

/** The rules a violation can break: obligations and prohibitions evaluated in violations. */
export const breakableRules = (rulesFile: T.RulesFile) =>
  rulesFile.rules.filter(
    (rule): rule is T.NormRule =>
      rule.kind === "norm" &&
      rule.requestTypes.includes("violation") &&
      (rule.modality === "obligation" || rule.modality === "prohibition")
  )

/** The units someone owns on a day. */
export const ownedUnits = (roll: RollData, personId: string | undefined, today: string) =>
  personId
    ? roll.links
        .filter((link) => link.personId === personId && link.relation === "owner" && isCurrent(link, today))
        .map((link) => link.unitId)
    : []

/**
 * Whether someone answers for a violation and so may see it, reply and ask for a hearing: they're named on it or own
 * its unit, and its notice has gone out. The board sees a report before then.
 */
export function respondsTo(record: ViolationRecord, roll: RollData, personId: string | undefined, today: string) {
  if (!personId || stepDates(record.events).noticeDeliveredOn === null) {
    return false
  }
  return (
    record.people.some((person) => person.personId === personId) ||
    ownedUnits(roll, personId, today).includes(record.violation.unitId)
  )
}

export const managesViolations = (context: RequestContext) => doesWorkOf(context.role, context.committees, "board")

export const caseOf = ({ violation, ruleKeys, people, events }: ViolationRecord): ViolationCase => ({
  violation,
  ruleKeys,
  people,
  events
})

/** A violation the requester may see, with its rulebook and today's date there; null when it isn't theirs to see. */
export async function loadViolation(context: RequestContext, violationId: string) {
  const db = getDb()
  const [record] = await getViolationRecords(db, context.organization.id, [violationId])
  if (!record) {
    return null
  }
  const roll = await getRoll(db, context.organization.id)
  const rulesFile = await rulesFiles(context.organization.id)(record.violation.rulebookId)
  const today = todayIn(rulesFile)
  const canManage = managesViolations(context)
  const canRespond = respondsTo(record, roll, context.person?.id, today)
  if (!canManage && !canRespond) {
    return null
  }
  return { record, roll, rulesFile, today, canManage, canRespond }
}

export type LoadedViolation = NonNullable<Awaited<ReturnType<typeof loadViolation>>>

/** What happens next with an open violation: which step, in words, on what day if one is set, and whose turn it is. */
export type NextStep = {
  step: "correct" | "cured" | "notice" | "hearing" | "cure" | "fine"
  text: string
  on: string | null
  waitsOn: "board" | "owner"
}

/** What the board, or the owner, does next with an open violation; null when nothing is due of them. */
export function nextStepOf(
  evaluation: Awaited<ReturnType<typeof evaluationOf>>,
  steps: ReturnType<typeof stepDates>,
  forBoard: boolean
): NextStep | null {
  const running = evaluation.cures.filter((cure) => cure.status === "running" && cure.endsOn)
  const cureEnds = running.map((cure) => cure.endsOn ?? "").toSorted()[0] ?? null
  if (!forBoard) {
    if (steps.curedOn) {
      return null
    }
    return {
      step: "correct",
      text: cureEnds ? `Correct it by ${dayText(cureEnds)}` : "Correct it",
      on: cureEnds,
      waitsOn: "owner"
    }
  }
  if (steps.curedOn) {
    return { step: "cured", text: `Cured ${dayText(steps.curedOn)}`, on: null, waitsOn: "board" }
  }
  if (!steps.noticeDeliveredOn) {
    return { step: "notice", text: "Send the notice", on: null, waitsOn: "board" }
  }
  if (steps.hearingRequestedOn && !steps.hearingHeldOn) {
    return { step: "hearing", text: "Hold the hearing", on: null, waitsOn: "board" }
  }
  if (cureEnds) {
    return { step: "cure", text: `Time to cure ends ${dayText(cureEnds)}`, on: cureEnds, waitsOn: "owner" }
  }
  const money = ["fine", "charge", "self-help"]
  return evaluation.sanctions.some((sanction) => sanction.outcome === "available" && money.includes(sanction.type))
    ? { step: "fine", text: "A fine can be imposed", on: null, waitsOn: "board" }
    : null
}

/**
 * The violations' records the requester may see, with the roll and today where the association is: every one for the
 * board, an owner's own once noticed.
 */
export async function visibleViolations(context: RequestContext) {
  const db = getDb()
  const organizationId = context.organization.id
  const canManage = managesViolations(context)
  const [roll, published] = await Promise.all([getRoll(db, organizationId), publishedRules(organizationId)])
  const today = todayIn(published?.rulesFile ?? null)
  const ids = await listViolationIds(
    db,
    organizationId,
    canManage ? {} : { unitIds: ownedUnits(roll, context.person?.id, today), personId: context.person?.id ?? "" }
  )
  const records = (await getViolationRecords(db, organizationId, ids)).filter(
    (record) => canManage || respondsTo(record, roll, context.person?.id, today)
  )
  return { records, roll, today, canManage, hasRulebook: published !== null }
}

/** A violation as lists show it: its unit, the rules it breaks, and what happens next, with its record. */
export type ViolationSummary = {
  id: string
  title: string
  unitId: string
  unit: string
  observedOn: string
  status: ViolationStatus
  rules: string[]
  nextStep: NextStep | null
  record: ViolationRecord
}

/** The violations the requester may see, with what happens next: every one for the board, an owner's own once noticed. */
export async function violationSummaries(context: RequestContext) {
  const organizationId = context.organization.id
  const { records, roll, today, canManage, hasRulebook } = await visibleViolations(context)
  const files = rulesFiles(organizationId)
  const units = new Map(roll.units.map((unit) => [unit.id, unit.label]))
  const items = await Promise.all(
    records.map(async (record): Promise<ViolationSummary> => {
      const rulesFile = await files(record.violation.rulebookId)
      const titles = new Map(rulesFile.rules.map((rule) => [rule.key, rule.title]))
      const loaded: LoadedViolation = { record, roll, rulesFile, today, canManage, canRespond: !canManage }
      return {
        id: record.violation.id,
        title: record.violation.title,
        unitId: record.violation.unitId,
        unit: units.get(record.violation.unitId) ?? "A unit no longer on the roll",
        observedOn: record.violation.observedOn,
        status: record.violation.status,
        rules: record.ruleKeys.map((key) => titles.get(key) ?? key),
        nextStep:
          record.violation.status === "open"
            ? nextStepOf(await evaluationOf(loaded, organizationId), stepDates(record.events), canManage)
            : null,
        record
      }
    })
  )
  return { items, today, canManage, hasRulebook }
}

/** What the documents allow for a loaded violation today, or with a step's date as given. */
export async function evaluationOf(
  { record, rulesFile, today }: LoadedViolation,
  organizationId: string,
  overrides: Parameters<typeof evaluateViolation>[4] = {}
) {
  const history = await violationHistory(getDb(), organizationId)
  return evaluateViolation(rulesFile, caseOf(record), history, today, overrides)
}

/** How a property's value is answered, when the board can answer it here; null when it can't. */
export function factInputOf(rulesFile: T.RulesFile, key: T.TermKey): FactInput | null {
  const vocabulary = rulebookVocabulary(rulesFile)
  const term = vocabulary.get(key)
  if (term?.kind !== "property" || term.many || term.derived || recordedProperties.has(key)) {
    return null
  }
  const { valueType } = term
  switch (valueType.type) {
    case "date":
    case "boolean":
      return { type: valueType.type }
    case "count":
      return { type: "number" }
    case "quantity":
      return { type: "quantity", unit: valueType.unit, unitLabel: vocabulary.label(valueType.unit, true) }
    case "choice":
      return {
        type: "choice",
        options: [...rulesFile.proposedCore, ...rulesFile.terms]
          .filter((value) => value.kind === "value" && value.set === valueType.set)
          .map((value) => ({ term: value.key, label: vocabulary.label(value.key) }))
      }
    default:
      return null
  }
}

/** Whether a value answers a property's input. */
export function answers(input: FactInput, value: FactValue) {
  switch (input.type) {
    case "date":
    case "boolean":
    case "number":
      return value.type === input.type
    case "quantity":
      return value.type === "quantity" && value.unit === input.unit
    case "choice":
      return value.type === "value" && input.options.some((option) => option.term === value.term)
  }
}

/** A stated value in words. */
function valueTextOf(value: FactValue, label: (key: T.TermKey, plural?: boolean) => string) {
  switch (value.type) {
    case "date":
      return dayText(value.value)
    case "boolean":
      return value.value ? "Yes" : "No"
    case "number":
      return String(value.value)
    case "quantity":
      return value.unit === "usd"
        ? money(Math.round(value.value * 100))
        : `${value.value} ${label(value.unit, value.value !== 1)}`
    case "value":
      return label(value.term)
  }
}

/** A violation's page, as the requester may see it. */
export async function violationView(context: RequestContext, loaded: LoadedViolation): Promise<ViolationView> {
  const { record, roll, rulesFile, today, canManage, canRespond } = loaded
  const { violation } = record
  const [evaluation, withNotice, names] = await Promise.all([
    evaluationOf(loaded, context.organization.id),
    evaluationOf(loaded, context.organization.id, { noticeDeliveredOn: today }),
    accountNames(getDb(), context.organization.id)
  ])
  const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
  const viewOf = (key: T.RuleKey) => {
    const rule = rules.get(key)
    return rule ? ruleViewOf(rulesFile, rule) : null
  }
  const unit = roll.units.find((candidate) => candidate.id === violation.unitId)
  const people = new Map(roll.people.map((person) => [person.id, person]))
  const imposed = imposedBySanction(record.events)
  const vocabulary = rulebookVocabulary(rulesFile)
  const procedures = new Map<string, ProcedureStep[] | null>()
  const stepsFor = (condition: T.Condition) => {
    const key = JSON.stringify(condition)
    const steps = procedures.has(key) ? procedures.get(key) : stepsToMeet(rulesFile, caseOf(record), today, condition)
    procedures.set(key, steps ?? null)
    return steps ?? null
  }
  // An owner sees the steps, not who on the board took them, nor who reported it.
  const recorder = (userId: string, kind: EventKind) => {
    const isOwn = userId === context.user.id
    if (canManage || isOwn || kind === "reply" || kind === "hearing-requested") {
      return isOwn ? "You" : (names.get(userId) ?? "Someone")
    }
    return context.organization.name
  }
  return {
    violation: {
      id: violation.id,
      title: violation.title,
      description: violation.description,
      observedOn: violation.observedOn,
      status: violation.status
    },
    association: context.organization.name,
    unit: {
      id: violation.unitId,
      label: unit?.label ?? "A unit no longer on the roll",
      address: unit ? addressLine(unit) || null : null
    },
    people: record.people.map((person) => {
      const found = people.get(person.personId)
      return {
        personId: person.personId,
        name: found?.name ?? "Someone no longer on the roll",
        party: person.party,
        email: canManage ? (found?.email ?? null) : null
      }
    }),
    rules: record.ruleKeys.flatMap((key) => viewOf(key) ?? []),
    photos: record.photos.map((photo) => ({
      id: photo.id,
      url: `/files/violations/${violation.id}/${photo.id}`,
      fileName: photo.fileName
    })),
    events: record.events.map((event): EventView => {
      const hearing = detailsOf(event, "hearing-set")
      const sanction = detailsOf(event, "sanction")
      const fact = detailsOf(event, "fact")
      return {
        id: event.id,
        kind: event.kind,
        occurredOn: event.occurredOn,
        note: event.note,
        by: recorder(event.recordedBy, event.kind),
        delivery: detailsOf(event, "notice")?.delivery ?? null,
        hearing: hearing ? { on: hearing.hearingOn, place: hearing.place } : null,
        curedInTime: detailsOf(event, "cured")?.inTime ?? null,
        sanction: sanction
          ? {
              title: rules.get(sanction.ruleKey)?.title ?? sanction.ruleKey,
              type: sanction.type,
              amountCents: sanction.amountCents
            }
          : null,
        fact: fact
          ? {
              label: vocabulary.label(fact.property),
              value: fact.value ? valueTextOf(fact.value, (key, plural) => vocabulary.label(key, plural)) : null
            }
          : null
      }
    }),
    steps: stepDates(record.events),
    today,
    cures: evaluation.cures,
    curesFromNotice: withNotice.cures,
    sanctions: canManage
      ? evaluation.sanctions.flatMap(({ inputs: _inputs, precondition, ...sanction }) => {
          const rule = viewOf(sanction.ruleKey)
          const label = (key: T.TermKey) => vocabulary.label(key)
          const labels = {
            against: sanction.against.map(label),
            imposedBy: sanction.imposedBy.map(label),
            suspends: sanction.suspends.map(label)
          }
          const procedure = precondition ? { steps: stepsFor(precondition) } : null
          return rule
            ? [{ ...sanction, rule, imposedCents: imposed.get(sanction.ruleKey) ?? 0, labels, procedure }]
            : []
        })
      : [],
    facts: canManage ? factQuestions(rulesFile, record, evaluation.reads) : [],
    canManage,
    canRespond
  }
}

/** A rule's main citation as people cite it: "Declaration 7.4(a)(i)". */
export const mainCitation = (rule: T.Rule) => {
  const [main] = rule.citations
  return main ? citationLabel(main.provisionKey) : ""
}

/** The facts the documents read about the violation that are unknown, or that the board has stated: unanswered first. */
function factQuestions(
  rulesFile: T.RulesFile,
  record: ViolationRecord,
  reads: readonly { entity: string; property: T.TermKey; state: string }[]
): FactQuestion[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  const label = (key: T.TermKey, plural?: boolean) => vocabulary.label(key, plural)
  const stated = statedFacts(record.events)
  const unknown = reads
    .filter((read) => read.entity === "request" && read.state === "unknown")
    .map((read) => read.property)
  const notes = new Map([...rulesFile.proposedCore, ...rulesFile.terms].map((term) => [term.key, term.scopeNote]))
  return [...new Set([...unknown, ...stated.keys()])].flatMap((key) => {
    const input = factInputOf(rulesFile, key)
    if (!input) {
      return []
    }
    const value = stated.get(key) ?? null
    return [
      {
        key,
        label: label(key),
        note: notes.get(key) ?? null,
        input,
        value,
        valueText: value ? valueTextOf(value, label) : null
      }
    ]
  })
}
