import { z } from "zod"
import type * as T from "./types"

// Zod for the rules schema (docs/design/schema.md). Every schema's output is checked against the TypeScript type it
// mirrors, in both directions, at the end of this file. The schemas check what one record can check on its own;
// validateRulebook checks what needs the other records.

// ─── Conventions ──────────────────────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2025-11-12")
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, "an ISO timestamp")
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time like 22:00")
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "a month and day like 11-15")
const weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
const id = z.string().min(1)
export const termKey = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/, "a term key like fence-run.height")
export const documentKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "a document key like guidelines")
export const provisionKey = z.string().regex(/^[a-z0-9-]+:\S+$/, "a provision key like guidelines:5.4.2(i)")
export const ruleKey = z
  .string()
  .regex(/^[a-z0-9-]+:\S+#[a-z0-9]+(-[a-z0-9]+)*$/, "a rule key like guidelines:5.4.2(i)#colors")
const amount = z.object({ value: z.number(), unit: termKey })

const provenance = z.union([
  z.object({ by: z.literal("extraction"), at: timestamp }),
  z.object({ by: z.literal("person"), userId: id, at: timestamp }),
  z.object({ by: z.literal("system"), at: timestamp })
])

const review = z.object({
  status: z.enum(["proposed", "approved", "rejected"]),
  by: id.nullable(),
  at: timestamp.nullable(),
  note: z.string().nullable()
})

// ─── Expressions (recursive) ──────────────────────────────────────────────────────────────────────

export const root = z.enum(["subject", "request", "lot", "community"])
const pathShape = { from: root.optional(), path: z.array(termKey) }
const path = z.object(pathShape)

export const operand: z.ZodType<T.Operand, T.Operand> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("ref"), ...pathShape }),
    z.object({ type: z.literal("quantity"), value: z.number(), unit: termKey }),
    z.object({ type: z.literal("fraction"), numerator: z.number().int(), denominator: z.number().int().positive() }),
    z.object({ type: z.literal("number"), value: z.number() }),
    z.object({ type: z.literal("value"), term: termKey }),
    z.object({ type: z.literal("boolean"), value: z.boolean() }),
    z.object({ type: z.literal("date"), value: isoDate }),
    z.object({ type: z.literal("time"), value: timeOfDay }),
    z.object({ type: z.literal("governing-date") }),
    z.object({ type: z.enum(["sum", "greatest", "least"]), of: z.array(operand).min(1) }),
    z.object({ type: z.enum(["difference", "product", "quotient"]), of: z.tuple([operand, operand]) }),
    z.object({ type: z.literal("count"), where: condition.nullable(), ...pathShape }),
    z.object({
      type: z.enum(["sum-of", "greatest-of", "least-of"]),
      value: z.array(termKey),
      where: condition.nullable(),
      ...pathShape
    }),
    z.object({ type: z.literal("shift"), of: operand, by: amount })
  ])
)

const offset = z.object({ value: z.number(), unit: termKey, at: timeOfDay.nullable() })

const timeWindow = z.union([
  z.object({ type: z.literal("daily"), from: timeOfDay, to: timeOfDay }),
  z.object({
    type: z.literal("weekly"),
    days: z.array(weekday).min(1),
    from: timeOfDay.nullable(),
    to: timeOfDay.nullable()
  }),
  z.object({ type: z.literal("annual"), from: monthDay, to: monthDay }),
  z.object({
    type: z.literal("recurring"),
    schedule: z.lazy(() => operand),
    from: offset.nullable(),
    to: offset.nullable()
  })
])

const approvalTest = {
  by: z.array(termKey).min(1),
  needs: z.enum(["all", "any"]),
  prior: z.boolean(),
  written: z.boolean()
}

export const condition: z.ZodType<T.Condition, T.Condition> = z.lazy(() =>
  z.union([
    z.object({ type: z.enum(["all", "any"]), of: z.array(condition).min(1) }),
    z.object({ type: z.literal("not"), of: condition }),
    z.object({
      type: z.literal("compare"),
      left: operand,
      op: z.enum(["=", "!=", "<", "<=", ">", ">="]),
      right: operand
    }),
    z.object({ type: z.literal("in"), left: operand, values: z.array(operand).min(1) }),
    z.object({
      type: z.literal("between"),
      left: operand,
      min: operand,
      max: operand,
      includeMin: z.boolean(),
      includeMax: z.boolean()
    }),
    z.object({ type: z.literal("exists"), ...pathShape }),
    z.object({ type: z.literal("is-a"), category: termKey, ...pathShape }),
    z.object({ type: z.literal("approved"), ...approvalTest, ...pathShape }),
    z.object({ type: z.enum(["every", "some", "none"]), where: condition.nullable(), test: condition, ...pathShape }),
    z.object({
      type: z.literal("during"),
      start: operand,
      end: operand,
      window: timeWindow,
      match: z.enum(["within", "overlaps"])
    }),
    z.object({ type: z.literal("text"), text: z.string().min(1) })
  ])
)

// ─── Sources ──────────────────────────────────────────────────────────────────────────────────────

export const documentKind = z.enum([
  "statute",
  "ordinance",
  "declaration",
  "supplemental-declaration",
  "plat",
  "articles",
  "bylaws",
  "rules",
  "policy",
  "design-guidelines",
  "resolution",
  "minutes",
  "decision"
])

export const citation = z.object({
  provisionKey,
  highlight: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).nullable(),
  region: z
    .object({
      page: z.number().int().positive(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1)
    })
    .nullable()
})

const edition = z.object({
  label: z.string().min(1),
  adoptedOn: isoDate.nullable(),
  adoptedBy: citation.nullable(),
  effectiveFrom: isoDate,
  basis: z.enum(["original", "restated", "consolidated"]),
  files: z.array(
    z.object({ fileId: id, sha256: z.string().regex(/^[0-9a-f]{64}$/), pages: z.number().int().positive() })
  ),
  recording: z.object({ instrument: z.string(), county: z.string(), recordedOn: isoDate }).nullable()
})

export const governingDocument = z.object({
  key: documentKey,
  kind: documentKind,
  title: z.string().min(1),
  issuedBy: termKey.nullable(),
  governs: condition.nullable(),
  edition: edition.nullable()
})

export const noRuleReason = z.enum(["heading", "recital", "reserved", "explanatory", "duplicate"])

export const provision = z.object({
  key: provisionKey,
  kind: z.enum(["article", "section", "point", "paragraph", "definition", "table", "row", "exhibit", "recital"]),
  num: z
    .object({
      printed: z.string().nullable(),
      normalized: z.string(),
      source: z.enum(["printed", "inferred", "counted"])
    })
    .nullable(),
  label: z.string().min(1),
  heading: z.string().nullable(),
  parentLabel: z.string().nullable(),
  intro: z.string().nullable(),
  text: z.string(),
  wrapUp: z.string().nullable(),
  anchors: z.array(
    z.object({
      fileId: id,
      page: z.number().int().positive(),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative()
    })
  ),
  noRule: z.object({ reason: noRuleReason, note: z.string().nullable(), review }).nullable()
})

// ─── Vocabulary ───────────────────────────────────────────────────────────────────────────────────

export const issueCode = z.enum([
  "citation-not-found",
  "undefined-term",
  "avoided-label",
  "type-mismatch",
  "invalid-value",
  "ambiguous-label",
  "conflict",
  "override-not-allowed",
  "table-overlap",
  "text-condition",
  "absent-in-exception",
  "undefined-document",
  "unencoded-quantity",
  "modality-cue-mismatch",
  "duplicate-key",
  "invalid-key",
  "undefined-rule",
  "invariant",
  "coverage"
])

const issue = z.object({
  code: issueCode,
  message: z.string(),
  related: z.array(ruleKey),
  resolution: z.object({ note: z.string(), by: id, at: timestamp }).nullable()
})

const labelRole = z.enum(["preferred", "alternative", "hidden", "avoid"])

const label = z.object({
  text: z.string().min(1),
  role: labelRole,
  plural: z.string().nullable(),
  citation: citation.nullable(),
  provenance
})

export const dimension = z.enum([
  "length",
  "area",
  "volume",
  "weight",
  "speed",
  "money",
  "ratio",
  "elapsed-time",
  "calendar-period",
  "business-time",
  "sound-level"
])

export const valueType = z.union([
  z.object({ type: z.literal("quantity"), unit: termKey }),
  z.object({ type: z.enum(["count", "boolean", "date", "date-time", "time-of-day", "schedule", "text"]) }),
  z.object({ type: z.literal("choice"), set: termKey }),
  z.object({ type: z.literal("reference"), to: termKey.nullable() }),
  z.object({ type: z.literal("party"), among: z.array(termKey).nullable() })
])

const requestType = z.object({
  flow: z.enum(["application", "enforcement", "filing", "duty"]),
  governingDate: termKey.nullable(),
  lot: z.enum(["required", "optional", "none"])
})

export const nature = z.enum(["party", "request", "event", "document", "object"])
export const ifUnstated = z.enum(["unknown", "absent"])
export const decimal = z.string().regex(/^\d+(\.\d+)?$/, "an exact decimal")
export const derivation = z.object({ when: condition.nullable(), value: operand, citations: z.array(citation) })

const termBase = {
  key: termKey,
  organizationId: id.nullable(),
  labels: z.array(label).min(1),
  definition: z.string().nullable(),
  scopeNote: z.string().nullable(),
  context: z.string().nullable(),
  citations: z.array(citation),
  provenance,
  review,
  issues: z.array(issue)
}

type Bookkeeping = "provenance" | "review" | "issues"
type DistributiveOmit<U, K extends PropertyKey> = U extends unknown ? Omit<U, K> : never
type LabelDraft = Omit<T.Label, "provenance">
type TermWithoutBookkeeping = DistributiveOmit<T.Term, Bookkeeping | "labels"> & { labels: LabelDraft[] }
type RuleWithoutBookkeeping = DistributiveOmit<T.Rule, Bookkeeping>

// The invariants one term can check on its own, for stored terms and drafts alike.
function checkTerm(term: TermWithoutBookkeeping, context: z.RefinementCtx) {
  if (term.labels.filter((l) => l.role === "preferred").length !== 1) {
    context.addIssue({ code: "custom", message: "a term has exactly one preferred label", path: ["labels"] })
  }
  if (term.kind === "thing" && (term.nature === "request") !== (term.request !== null)) {
    context.addIssue({ code: "custom", message: "a thing has request data exactly when its nature is request" })
  }
}

export const term = z
  .discriminatedUnion("kind", [
    z.object({ ...termBase, kind: z.literal("thing"), nature, request: requestType.nullable() }),
    z.object({ ...termBase, kind: z.literal("category"), of: termKey, criteria: condition }),
    z.object({
      ...termBase,
      kind: z.literal("property"),
      of: termKey,
      valueType,
      many: z.boolean(),
      ifUnstated,
      derived: z.array(derivation).nullable()
    }),
    z.object({ ...termBase, kind: z.literal("value"), set: termKey, broader: z.array(termKey) }),
    z.object({ ...termBase, kind: z.literal("value-set"), complete: z.boolean() }),
    z.object({ ...termBase, kind: z.literal("unit"), dimension, perBase: decimal.nullable() })
  ])
  .superRefine(checkTerm)

// ─── Rules and checks ─────────────────────────────────────────────────────────────────────────────

const cell = z.union([
  z.object({ type: z.literal("any") }),
  z.object({ type: z.enum(["in", "not-in"]), values: z.array(operand).min(1) }),
  z.object({
    type: z.literal("range"),
    min: operand.nullable(),
    max: operand.nullable(),
    includeMin: z.boolean(),
    includeMax: z.boolean()
  })
])

const effect = z.object({ type: z.literal("deems"), target: path, value: operand })

export const check = z.union([
  z.object({ type: z.literal("test"), test: condition }),
  z.object({
    type: z.literal("table"),
    inputs: z.array(operand).min(1),
    rows: z
      .array(
        z.object({ when: z.array(cell).min(1), result: z.enum(["met", "not-met"]), citation: citation.nullable() })
      )
      .min(1),
    otherwise: z.enum(["met", "not-met"])
  }),
  z.object({
    type: z.literal("document"),
    document: termKey,
    per: z.enum(["request", "subject"]),
    mustState: z.array(z.string()),
    signedBy: z.array(termKey)
  }),
  z.object({
    type: z.literal("deadline"),
    act: operand,
    anchor: operand,
    earliest: offset.nullable(),
    latest: offset.nullable(),
    onMiss: z.array(effect)
  }),
  z.object({ type: z.literal("judgment"), question: z.string().min(1), evidence: z.array(termKey) }),
  z.object({ type: z.literal("approval"), ...approvalTest })
])

export const domain = z.enum([
  "architectural",
  "use",
  "maintenance",
  "financial",
  "governance",
  "enforcement",
  "general"
])
export const normModality = z.enum(["obligation", "prohibition", "permission", "recommendation", "requirement"])
export const sanctionModality = z.enum(["obligation", "permission"])
export const ruleRemedy = z.enum(["change-detail", "redesign", "none"])
export const cure = z.object({ value: z.number().nonnegative(), unit: termKey, after: path, curedBy: path.nullable() })
export const ruleSelection = z.union([
  z.array(ruleKey),
  z.object({
    documents: z.array(documentKey),
    provisions: z.array(provisionKey),
    adoptedAfter: path.nullable(),
    except: z.array(ruleKey)
  })
])
const scope = z.object({ lotId: id, subjectId: id.nullable() })

const ruleBase = {
  key: ruleKey,
  domain,
  title: z.string().min(1),
  statement: z.string().min(1),
  citations: z.array(citation),
  requestTypes: z.array(termKey),
  appliesTo: termKey.nullable(),
  appliesWhen: condition.nullable(),
  scope: scope.nullable(),
  authority: citation.nullable(),
  effectiveFrom: isoDate,
  provenance,
  review,
  issues: z.array(issue)
}

export const sanction = z.object({
  type: z.enum([
    "fine",
    "late-fee",
    "interest",
    "charge",
    "suspension",
    "self-help",
    "towing",
    "lien",
    "legal-action",
    "record-notice",
    "acceleration"
  ]),
  amounts: z.union([z.array(operand).min(1), z.literal("none"), z.literal("set-by-imposer")]),
  after: z.object({ value: z.number().nonnegative(), unit: termKey, from: path }).nullable(),
  occurrences: z
    .object({
      within: amount,
      counts: z.enum(["same-rule", "enforced-rules"]),
      per: z.enum(["owner", "lot"]),
      includesCured: z.boolean()
    })
    .nullable(),
  repeats: z.object({ every: amount, amount: operand, from: path.nullable() }).nullable(),
  cap: operand.nullable(),
  suspends: z.array(termKey),
  lasts: z.union([amount, z.object({ atMost: amount }), z.enum(["until-cured", "until-paid"])]).nullable()
})

// The invariants one rule can check on its own (schema.md, Invariants), for stored rules and drafts alike.
function checkRule(rule: RuleWithoutBookkeeping, context: z.RefinementCtx) {
  const fail = (message: string, ...path: string[]) => context.addIssue({ code: "custom", message, path })
  const hasSelector = (rule.kind === "norm" || rule.kind === "discretion") && !Array.isArray(rule.overrides)
  if (rule.appliesTo === null && !hasSelector) {
    fail("appliesTo is null only with an overrides selector", "appliesTo")
  }
  if (rule.kind === "discretion" && Array.isArray(rule.overrides) && rule.overrides.length === 0) {
    fail("a discretion rule overrides at least one rule", "overrides")
  }
  if (rule.kind === "sanction") {
    if (rule.enforces.rules.length === 0 && rule.enforces.documents.length === 0) {
      fail("a sanction enforces at least one rule or document", "enforces")
    }
    if (rule.appliesTo === null || !rule.requestTypes.includes(rule.appliesTo)) {
      fail("a sanction's appliesTo is one of its request types", "appliesTo")
    }
  }
  if (rule.kind !== "norm") {
    return
  }
  if ((rule.bearer === null) !== (rule.modality === "requirement")) {
    fail("a requirement has no bearer, and every other norm has one", "bearer")
  }
  const needsCheck =
    rule.modality === "obligation" || rule.modality === "recommendation" || rule.modality === "requirement"
  if (needsCheck && rule.check === null) {
    fail(`${rule.modality === "obligation" ? "an" : "a"} ${rule.modality} needs a check`, "check")
  }
  if (!needsCheck && rule.check !== null) {
    fail(`a ${rule.modality} never has a check`, "check")
  }
  if (rule.check?.type === "judgment" && rule.decidedBy === null) {
    fail("a judgment check needs decidedBy", "decidedBy")
  }
  if (rule.modality === "requirement" && (rule.remedy !== null || rule.cure !== null)) {
    fail("a requirement has no remedy or cure", rule.remedy === null ? "cure" : "remedy")
  }
  if (rule.remedy === "none" && rule.cure !== null && rule.cure !== "none") {
    fail("remedy none can't have a cure period", "cure")
  }
}

export const rule = z
  .discriminatedUnion("kind", [
    z.object({
      ...ruleBase,
      kind: z.literal("norm"),
      modality: normModality,
      bearer: termKey.nullable(),
      beneficiary: termKey.nullable(),
      decidedBy: termKey.nullable(),
      overrides: ruleSelection,
      noExceptions: citation.nullable(),
      check: check.nullable(),
      remedy: ruleRemedy.nullable(),
      recurs: operand.nullable(),
      cure: z.union([cure, z.literal("none")]).nullable()
    }),
    z.object({ ...ruleBase, kind: z.literal("discretion"), decidedBy: termKey, overrides: ruleSelection }),
    z.object({
      ...ruleBase,
      kind: z.literal("sanction"),
      modality: sanctionModality,
      enforces: z.object({ rules: z.array(ruleKey), documents: z.array(documentKey), except: z.array(ruleKey) }),
      against: z.array(termKey).min(1),
      imposedBy: termKey,
      sanction
    }),
    z.object({
      ...ruleBase,
      kind: z.literal("limit"),
      limits: z.array(ruleKey).min(1),
      forbids: z.boolean(),
      maxAmount: operand.nullable(),
      maxTotal: operand.nullable()
    })
  ])
  .superRefine((r, context) => {
    if (r.review.status === "approved" && r.citations.length === 0) {
      context.addIssue({ code: "custom", message: "an approved rule has at least one citation", path: ["citations"] })
    }
    checkRule(r, context)
  })

// ─── Settings, questions, the rules file ──────────────────────────────────────────────────────────

const recommendedAction = z.enum(["approve-with-conditions", "deny", "request-information", "refer-to-committee"])

export const clauses = z.object({
  precedence: z.object({ order: z.array(z.array(documentKind).min(1)), citations: z.array(citation) }),
  time: z.object({
    days: termKey,
    rollForward: z.boolean(),
    holidays: z.string(),
    zone: z.string(),
    citations: z.array(citation)
  }),
  liability: z.array(
    z.object({
      actor: termKey,
      liable: termKey,
      appliesWhen: condition.nullable(),
      until: path.nullable(),
      except: ruleSelection,
      citations: z.array(citation)
    })
  ),
  cure: cure.extend({ citations: z.array(citation) }).nullable(),
  deciders: z.array(z.object({ requestType: termKey, party: termKey, citations: z.array(citation) })),
  sanctionPreconditions: z.array(
    z.object({
      requestTypes: z.array(termKey).min(1),
      condition,
      except: ruleSelection,
      citations: z.array(citation)
    })
  )
})

export const settings = z.object({
  clauses,
  policy: z.object({
    decisionPolicy: z.object({
      "change-detail": recommendedAction,
      redesign: recommendedAction,
      none: recommendedAction
    }),
    thresholds: z.object({
      factConfidence: z.number().min(0).max(1),
      judgmentConfidence: z.number().min(0).max(1)
    })
  }),
  review,
  issues: z.array(issue)
})

const questionShape = {
  kind: z.enum(["interpretation", "conflict"]),
  question: z.string().min(1),
  citations: z.array(citation),
  about: z.object({ rules: z.array(ruleKey), terms: z.array(termKey) }),
  options: z.array(z.object({ label: z.string(), keeps: z.array(ruleKey) }))
}
const answer = z.object({
  option: z.number().int().nonnegative().nullable(),
  text: z.string().nullable(),
  by: id,
  at: timestamp
})

export const question = z.object({ id, ...questionShape, answer: answer.nullable() })

export const rulesFile = z.object({
  organization: z.object({ id, name: z.string().min(1) }),
  documents: z.array(governingDocument),
  provisions: z.array(provision),
  terms: z.array(term),
  proposedCore: z.array(term),
  rules: z.array(rule),
  settings,
  questions: z.array(question)
})

// ─── Evaluation: what goes in, what comes out ─────────────────────────────────────────────────────

export const factValue = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quantity"), value: z.number(), unit: termKey }),
  z.object({ type: z.literal("number"), value: z.number() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("value"), term: termKey.nullable(), text: z.string() }),
  z.object({ type: z.literal("date"), value: isoDate }),
  z.object({ type: z.literal("date-time"), value: timestamp }),
  z.object({ type: z.literal("time"), value: timeOfDay }),
  z.object({
    type: z.literal("schedule"),
    weekly: z.array(weekday),
    annual: z.array(monthDay),
    every: z.object({ value: z.number(), unit: termKey, from: isoDate }).nullable()
  }),
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("entity"), entity: z.string() })
])

export const evidence = z.object({
  fileId: id,
  page: z.number().int().positive().nullable(),
  quote: z.string().nullable(),
  region: z.array(z.number()).nullable()
})

const factState = z.enum(["known", "absent", "conflicting", "uncertain"])

export const fact = z.object({
  entity: z.string(),
  property: termKey,
  state: factState,
  value: factValue.nullable(),
  candidates: z.array(factValue),
  complete: z.boolean().nullable(),
  stated: z.string().nullable(),
  evidence: z.array(evidence),
  confidence: z.number().min(0).max(1).nullable(),
  provenance
})

export const evaluationRequest = z.object({
  organizationId: id,
  type: termKey,
  governingDate: isoDate,
  evaluationDate: isoDate,
  lot: z.string().nullable(),
  entities: z.array(z.object({ id: z.string(), type: termKey, label: z.string(), ref: z.string().nullable() })),
  facts: z.array(fact),
  documents: z.array(z.object({ id, type: termKey, subjects: z.array(z.string()), signedBy: z.array(z.string()) }))
})

export const outcome = z.enum([
  "met",
  "not-met",
  "advisory",
  "missing-information",
  "committee",
  "pending",
  "exempt",
  "not-applicable",
  "available",
  "blocked"
])

const judgmentAnswer = z.object({
  answer: z.enum(["yes", "no", "unclear"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidence: z.array(evidence)
})

export const finding = z.object({
  ruleKey,
  entity: z.string(),
  outcome,
  remedy: z.enum(["provide-information", "provide-document", "change-detail", "redesign", "none"]).nullable(),
  reason: z.string(),
  inputs: z.array(
    z.object({ entity: z.string(), property: termKey, state: z.enum([...factState.options, "unknown", "derived"]) })
  ),
  modifiedBy: z.array(z.object({ ruleKey, effect: z.enum(["displaced", "exempt", "decided-by", "limited"]) })),
  judgment: judgmentAnswer.nullable(),
  statements: z.array(
    z.object({ statement: z.string(), confirmed: z.boolean().nullable(), quote: z.string().nullable() })
  ),
  effects: z.array(z.object({ target: path, value: factValue, from: isoDate })),
  sanction: z
    .object({ enforced: ruleKey, occurrence: z.number().int().nullable(), amount: amount.nullable() })
    .nullable(),
  asOf: isoDate,
  evaluatedAt: timestamp
})

// ─── Drafts: what extraction and the editor send ──────────────────────────────────────────────────

// A draft leaves out what code fills (provenance, review, issues, a label's provenance, a question's id) and may omit
// any field whose default is null, an empty list or false. Parsing a draft gives the stored shape minus the bookkeeping.
const d = <S extends z.ZodType>(schema: S) => schema.nullable().default(null)
const list = <S extends z.ZodType>(schema: S) => z.array(schema).default([])

const termDraftBase = {
  key: termKey,
  organizationId: d(id),
  labels: z
    .array(z.object({ text: z.string().min(1), role: labelRole, plural: d(z.string()), citation: d(citation) }))
    .min(1),
  definition: d(z.string()),
  scopeNote: d(z.string()),
  context: d(z.string()),
  citations: list(citation)
}

export const termDraft = z
  .discriminatedUnion("kind", [
    z.object({ ...termDraftBase, kind: z.literal("thing"), nature, request: d(requestType) }),
    z.object({ ...termDraftBase, kind: z.literal("category"), of: termKey, criteria: condition }),
    z.object({
      ...termDraftBase,
      kind: z.literal("property"),
      of: termKey,
      valueType,
      many: z.boolean().default(false),
      ifUnstated,
      derived: d(z.array(derivation))
    }),
    z.object({ ...termDraftBase, kind: z.literal("value"), set: termKey, broader: list(termKey) }),
    z.object({ ...termDraftBase, kind: z.literal("value-set"), complete: z.boolean().default(false) }),
    z.object({ ...termDraftBase, kind: z.literal("unit"), dimension, perBase: d(decimal) })
  ])
  .superRefine(checkTerm)

/** A rule's statement as a draft writes it, with the term-link syntax described for the model. */
export const statementDraft = z
  .string()
  .min(1)
  .describe(
    "Link a term by writing its key in double curly braces, such as {{fence-run}}; {{fence-run:plural}} for the plural."
  )

/** A sanction's body as a draft writes it: fields whose default is null or empty may be left out. */
export const sanctionDraft = z.object({
  type: sanction.shape.type,
  amounts: sanction.shape.amounts,
  after: d(sanction.shape.after.unwrap()),
  occurrences: d(sanction.shape.occurrences.unwrap()),
  repeats: d(sanction.shape.repeats.unwrap()),
  cap: d(operand),
  suspends: list(termKey),
  lasts: d(sanction.shape.lasts.unwrap())
})

const draftBase = {
  key: ruleKey,
  domain,
  title: z.string().min(1),
  statement: statementDraft,
  citations: z.array(citation).min(1),
  requestTypes: z.array(termKey),
  appliesTo: d(termKey),
  appliesWhen: d(condition),
  scope: d(scope),
  authority: d(citation),
  effectiveFrom: isoDate
}

export const ruleDraft = z
  .discriminatedUnion("kind", [
    z.object({
      ...draftBase,
      kind: z.literal("norm"),
      modality: normModality,
      bearer: d(termKey),
      beneficiary: d(termKey),
      decidedBy: d(termKey),
      overrides: ruleSelection.default([]),
      noExceptions: d(citation),
      check: d(check),
      remedy: d(ruleRemedy),
      recurs: d(operand),
      cure: d(z.union([cure, z.literal("none")]))
    }),
    z.object({ ...draftBase, kind: z.literal("discretion"), decidedBy: termKey, overrides: ruleSelection }),
    z.object({
      ...draftBase,
      kind: z.literal("sanction"),
      modality: sanctionModality,
      enforces: z.object({ rules: list(ruleKey), documents: list(documentKey), except: list(ruleKey) }),
      against: z.array(termKey).min(1).default(["owner"]),
      imposedBy: termKey,
      sanction: sanctionDraft
    }),
    z.object({
      ...draftBase,
      kind: z.literal("limit"),
      limits: z.array(ruleKey).min(1),
      forbids: z.boolean().default(false),
      maxAmount: d(operand),
      maxTotal: d(operand)
    })
  ])
  .superRefine(checkRule)

export const questionDraft = z.object({
  ...questionShape,
  citations: list(citation),
  about: z.object({ rules: list(ruleKey), terms: list(termKey) }),
  answer: d(answer)
})

// One section's or batch's draft (encoding.md, Merge). Provisions come back by key; code attaches their stored text.
export const encodingDraft = z.object({
  provisions: z.array(
    z.object({ key: provisionKey, noRule: d(z.object({ reason: noRuleReason, note: d(z.string()) })) })
  ),
  terms: list(termDraft),
  rules: list(ruleDraft),
  questions: list(questionDraft),
  clauses: clauses.partial().default({}),
  referencedDocuments: list(z.object({ key: documentKey, kind: documentKind, title: z.string().min(1) })),
  notes: list(z.string())
})

export type RuleDraft = z.input<typeof ruleDraft>
export type TermDraft = z.input<typeof termDraft>
export type QuestionDraft = z.input<typeof questionDraft>
export type EncodingDraft = z.input<typeof encodingDraft>

// A record without its bookkeeping: what a draft parses to, and what validateRulebook reads. Stored records are
// assignable to these too.
export type RuleContent = z.output<typeof ruleDraft>
export type TermContent = z.output<typeof termDraft>
export type QuestionContent = z.output<typeof questionDraft>
export type EncodingDraftContent = z.output<typeof encodingDraft>

// ─── The Zod output and the TypeScript types agree, both ways ─────────────────────────────────────

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const agree = <_ extends true>() => undefined

agree<Same<z.infer<typeof rulesFile>, T.RulesFile>>()
agree<Same<z.infer<typeof rule>, T.Rule>>()
agree<Same<z.infer<typeof term>, T.Term>>()
agree<Same<z.infer<typeof provision>, T.Provision>>()
agree<Same<z.infer<typeof settings>, T.Settings>>()
agree<Same<z.infer<typeof fact>, T.Fact>>()
agree<Same<z.infer<typeof evaluationRequest>, T.EvaluationRequest>>()
agree<Same<z.infer<typeof finding>, T.Finding>>()
agree<Same<RuleContent, RuleWithoutBookkeeping>>()
agree<Same<TermContent, TermWithoutBookkeeping>>()
agree<Same<QuestionContent, Omit<T.Question, "id">>>()
agree<
  Same<
    z.output<typeof encodingDraft>,
    {
      provisions: { key: T.ProvisionKey; noRule: Omit<T.NoRule, "review"> | null }[]
      terms: TermWithoutBookkeeping[]
      rules: RuleWithoutBookkeeping[]
      questions: Omit<T.Question, "id">[]
      clauses: Partial<T.Settings["clauses"]>
      referencedDocuments: Pick<T.GoverningDocument, "key" | "kind" | "title">[]
      notes: string[]
    }
  >
>()
