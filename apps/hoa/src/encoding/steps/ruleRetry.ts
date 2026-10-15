import { z } from "zod"
import { canonicalJson } from "@/rulebook/canonical"
import type { RuleKey } from "@/schema/types"
import type { JsonPath } from "@/schema/validate"
import { domain } from "@/schema/zod"
import { pathText } from "../promptVariables"
import { kindName, type CheckType, type Outline } from "./outline"
import { structureOf } from "./ruleStructuring"

// F's retry: the rules that still have problems go back to F with their problems (paths inside the rule), and F
// returns them whole.

/** One problem of a rule, with its path inside the rule. */
export type RecordProblem = { code: string; class: string; message: string; path: JsonPath }

/** A rule with problems, as a run left it (it may fail Zod). */
export type ProblemRecord = {
  unitId: string
  key: RuleKey
  record: Record<string, unknown>
  problems: RecordProblem[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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
    bearer: ruleKind === "norm" ? texts(record.bearer) : [],
    appliesTo: texts(record.appliesTo),
    requestTypes: ruleKind === "sanction" ? requestTypes.slice(0, 1) : requestTypes,
    check: ruleKind === "norm" ? check : null,
    decidedBy: texts(record.decidedBy),
    targets: null,
    except: null,
    sanction:
      ruleKind === "sanction"
        ? {
            type: text(sanction.type) ?? "fine",
            imposedBy: texts(record.imposedBy),
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
