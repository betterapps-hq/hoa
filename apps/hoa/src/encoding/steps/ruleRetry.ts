import { z } from "zod"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import type { RuleKey } from "@/schema/types"
import type { JsonPath } from "@/schema/validate"
import { domain } from "@/schema/zod"
import { pathText } from "../promptVariables"
import { kindName, type CheckType, type Outline } from "./outline"
import { structureOf } from "./ruleStructuring"

// F's retry (it replaces patch repair): the rules that still have problems go back to F with their problems (paths
// inside the rule); F returns them whole, and code diffs each against the version before to report collateral changes,
// fields changed outside the problem paths. The title and statement may change with a value they state. Recorded
// failing rules from saved runs are the retry's test corpus.

/** One problem of a rule, with its path inside the rule. */
export type RecordProblem = { code: string; class: string; message: string; path: JsonPath }

/** A rule with problems, as a run left it (it may fail Zod). */
export type ProblemRecord = {
  unitId: string
  key: RuleKey
  record: Record<string, unknown>
  problems: RecordProblem[]
}

type UnitState = {
  unitId: string
  answer: unknown
  problems: readonly { source: "zod" | "validator"; code: string; message: string; path: JsonPath }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * A problem's class: the validator's code, or for Zod the rule its message states (a judgment without a decider, a
 * sanction's subject), so shape errors are counted by what they are.
 */
export const problemClass = (problem: { source: "zod" | "validator"; code: string; message: string }) =>
  problem.source === "validator" ? problem.code : `shape: ${problem.code === "custom" ? problem.message : problem.code}`

/** Classes code fixes, or that need other sections' rules: never sent back to F. */
const fixedElsewhere = new Set(["coverage", "undefined-rule"])

/** The rules with problems in a run's verified sections, each with its problems relative to the rule. */
export function problemRecords(states: readonly UnitState[]): ProblemRecord[] {
  const records: ProblemRecord[] = []
  for (const state of states) {
    const rules = isRecord(state.answer) && Array.isArray(state.answer.rules) ? state.answer.rules : []
    const byIndex = new Map<number, RecordProblem[]>()
    for (const problem of state.problems) {
      const [first, index, ...rest] = problem.path
      const kind = problemClass(problem)
      if (first !== "rules" || typeof index !== "number" || fixedElsewhere.has(kind)) {
        continue
      }
      byIndex.set(index, [
        ...(byIndex.get(index) ?? []),
        { code: problem.code, class: kind, message: problem.message, path: rest }
      ])
    }
    for (const [index, problems] of [...byIndex].toSorted(([a], [b]) => a - b)) {
      const record = rules[index]
      if (isRecord(record)) {
        const key = typeof record.key === "string" ? record.key : `${state.unitId}#rule-${index + 1}`
        records.push({ unitId: state.unitId, key, record, problems })
      }
    }
  }
  return records
}

/**
 * A stratified corpus: for each class prefix in `quota`, the first records (in the run's order) with a problem of that
 * class, up to its count. A record is taken once.
 */
export function selectRecords(records: readonly ProblemRecord[], quota: ReadonlyMap<string, number>) {
  const taken = new Set<ProblemRecord>()
  for (const [prefix, count] of quota) {
    records
      .filter((record) => !taken.has(record) && record.problems.some((problem) => problem.class.startsWith(prefix)))
      .slice(0, count)
      .forEach((record) => taken.add(record))
  }
  return records.filter((record) => taken.has(record))
}

const text = (value: unknown) => (typeof value === "string" ? value : null)
const texts = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : [])
const checkTypes = z.enum(["test", "table", "document", "deadline", "approval", "judgment"])

/** A recorded rule's outline: everything the retry may not change, read from the rule as it stands. */
export function outlineOfRecord(item: ProblemRecord): Outline {
  const { record } = item
  const kind = text(record.kind)
  const ruleKind = kind === "discretion" || kind === "sanction" || kind === "limit" ? kind : "norm"
  const citations = Array.isArray(record.citations)
    ? record.citations.flatMap((citation) => (isRecord(citation) ? texts([citation.provisionKey]) : []))
    : []
  const [main = item.key.slice(0, Math.max(0, item.key.indexOf("#"))), ...others] = citations
  const check: CheckType | null = isRecord(record.check)
    ? checkTypes.nullable().catch(null).parse(record.check.type)
    : null
  const enforces = isRecord(record.enforces) ? record.enforces : {}
  const sanction = isRecord(record.sanction) ? record.sanction : {}
  const overrides = record.overrides
  const requestTypes = texts(record.requestTypes)
  const selector =
    isRecord(overrides) && Array.isArray(overrides.documents)
      ? {
          documents: texts(overrides.documents),
          provisions: texts(overrides.provisions),
          adoptedAfter: null,
          except: texts(overrides.except)
        }
      : null
  const listed =
    ruleKind === "sanction"
      ? { rules: texts(enforces.rules), documents: texts(enforces.documents), except: texts(enforces.except) }
      : { rules: texts(ruleKind === "limit" ? record.limits : overrides), documents: [], except: [] }
  return {
    key: item.key,
    provisionKey: main,
    unitId: item.unitId,
    summary: text(record.statement) ?? text(record.title) ?? "",
    domain: domain.catch("general").parse(record.domain),
    citations: others,
    interpretation: false,
    reads: [],
    readKeys: [],
    kind: ruleKind,
    modality: text(record.modality),
    bearer: ruleKind === "norm" ? text(record.bearer) : null,
    appliesTo: text(record.appliesTo),
    requestTypes: ruleKind === "sanction" ? requestTypes.slice(0, 1) : requestTypes,
    check: ruleKind === "norm" ? check : null,
    decidedBy: text(record.decidedBy),
    targets: null,
    except: null,
    sanction:
      ruleKind === "sanction"
        ? {
            type: text(sanction.type) ?? "fine",
            imposedBy: text(record.imposedBy) ?? "",
            against: texts(record.against)
          }
        : null,
    resolved: listed,
    selector
  }
}

/**
 * The retry's problems variable: each failing rule in F's answer format (as F returned it), then its problems, one per
 * line as `rule: path: message [code]`, the path inside the rule.
 */
export function retryProblemsText(records: readonly ProblemRecord[]) {
  return records
    .map((item) =>
      [
        canonicalJson(structureOf(item.record, kindName(outlineOfRecord(item)))),
        ...item.problems.map(
          (problem) => `${item.key}: ${pathText(problem.path) || "(rule)"}: ${problem.message} [${problem.code}]`
        )
      ].join("\n")
    )
    .join("\n\n")
}

/** Batches of at most `size` records, each from one section. */
export function retryBatches(records: readonly ProblemRecord[], size = 10) {
  const batches: ProblemRecord[][] = []
  for (const record of records) {
    const last = batches.at(-1)
    if (last && last.length < size && last[0]?.unitId === record.unitId) {
      last.push(record)
    } else {
      batches.push([record])
    }
  }
  return batches
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0) ||
  (isRecord(value) && Object.keys(value).length === 0)

/** The paths at which two JSON values differ, down to the first difference; a missing field equals null or empty. */
export function changedPaths(before: unknown, after: unknown, at: JsonPath = []): JsonPath[] {
  if (isEmpty(before) && isEmpty(after)) {
    return []
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length
      ? before.flatMap((item, index) => changedPaths(item, after[index], [...at, index]))
      : [at]
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted(compareCodeUnits)
    return keys.flatMap((key) => changedPaths(before[key], after[key], [...at, key]))
  }
  return canonicalJson(before) === canonicalJson(after) ? [] : [at]
}

const startsWith = (path: JsonPath, prefix: JsonPath) => prefix.every((step, index) => path[index] === step)

/** Fields that may change with what a fix changes: the title and statement say the values. */
const sayFields = new Set<string | number>(["title", "statement"])

/**
 * Fields a fix changed outside its problems: a change is expected at or under a problem's path, or holding one (a
 * replaced subtree); a changed title or statement is reported apart, since it may follow a fixed value.
 */
export function collateralChanges(before: unknown, after: unknown, problemPaths: readonly JsonPath[]) {
  const changed = changedPaths(before, after)
  const outside = changed.filter(
    (path) => !problemPaths.some((problem) => startsWith(path, problem) || startsWith(problem, path))
  )
  return {
    changed,
    collateral: outside.filter((path) => !sayFields.has(path[0] ?? "")),
    wordingChanged: outside.some((path) => sayFields.has(path[0] ?? ""))
  }
}
