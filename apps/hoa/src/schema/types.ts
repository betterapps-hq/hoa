// The rules schema's types. docs/design/schema.md shows each section below; regenerate it with pnpm docs:schema.

// ─── Conventions ────────────────────────────────────────────────────────────────────────────────

export type Id = string // opaque id of a record outside the file: a file, a lot, a user
export type IsoDate = string // "2025-11-12", the organization's local calendar date
export type Timestamp = string // "2026-10-08T14:03:00Z"
export type TimeOfDay = string // "22:00", 24-hour local time
export type MonthDay = string // "11-15"
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
export type TermKey = string // "fence-run.height"; display always uses the term's labels
export type ProvisionKey = string // "guidelines:5.4.2(i)": its document's key and its label
export type RuleKey = string // "guidelines:5.4.2(i)#colors": its main citation's provision key and an aspect
export type Amount = { value: number; unit: TermKey } // a quantity: { value: 72, unit: "inch" }

export type Provenance =
  | { by: "extraction"; at: Timestamp } // proposed by the portal from documents or a requester's files; needs review
  | { by: "person"; userId: Id; at: Timestamp }
  | { by: "system"; at: Timestamp } // derived or matched by code

export type Review = {
  status: "proposed" | "approved" | "rejected"
  by: Id | null
  at: Timestamp | null
  note: string | null
}

// ─── Sources: documents, provisions, citations ───────────────────────────────────────────────────

export type DocumentKind =
  | "statute"
  | "ordinance"
  | "declaration"
  | "supplemental-declaration"
  | "plat"
  | "articles"
  | "bylaws"
  | "rules"
  | "policy"
  | "design-guidelines"
  | "resolution"
  | "minutes"
  | "decision"

export type GoverningDocument = {
  key: string // "guidelines": the start of its provision keys; unique within the file
  kind: DocumentKind
  title: string
  issuedBy: TermKey | null // the party that adopts it: "members", "board", "committee"; null for law
  governs: Condition | null // the lots it covers, with lot as the subject; null = the whole community
  edition: Edition | null // the text in the file; null = named by other documents, not uploaded
}

export type Edition = {
  label: string // "Board approved 2025-11-12", "Recorded 2001-12-04, as amended 2026-04-02"
  adoptedOn: IsoDate | null // approved, voted or recorded
  adoptedBy: Citation | null // the resolution or minutes that adopted it, when the organization has them
  effectiveFrom: IsoDate // when this text took effect: for a consolidated text, its latest amendment's date
  basis: "original" | "restated" | "consolidated" // consolidated: the original with its amendments applied
  files: { fileId: Id; sha256: string; pages: number }[] // the original or restatement first, then each amendment
  recording: { instrument: string; county: string; recordedOn: IsoDate } | null
}

export type Provision = {
  key: ProvisionKey // unique within the file
  kind: "article" | "section" | "point" | "paragraph" | "definition" | "table" | "row" | "exhibit" | "recital"
  num: { printed: string | null; normalized: string; source: "printed" | "inferred" | "counted" } | null
  label: string // "5.4.2(i)": its number; unique within the document
  heading: string | null
  parentLabel: string | null
  intro: string | null // a lead-in that governs the provision's children: "The following are prohibited:"
  text: string // verbatim; excludes the intro, the wrap-up and the children's text
  wrapUp: string | null // text after the children that finishes them
  anchors: { fileId: Id; page: number; start: number; end: number }[] // character ranges in page text; may span pages
  noRule: NoRule | null // why no rule cites it; approved by an administrator
}

export type NoRule = {
  reason: "heading" | "recital" | "reserved" | "explanatory" | "duplicate"
  note: string | null
  review: Review
}

export type Citation = {
  provisionKey: ProvisionKey
  highlight: { start: number; end: number } | null // the operative words within provision.text; null = all of it
  region: { page: number; x: number; y: number; width: number; height: number } | null // a box on a drawing or plat
}

// ─── Vocabulary: terms, labels, values, units ─────────────────────────────────────────────────────

export type Label = {
  text: string
  role: "preferred" | "alternative" | "hidden" | "avoid"
  plural: string | null // preferred label only: "fence runs"
  citation: Citation | null // where the documents use this wording
  provenance: Provenance
}

export type Dimension =
  | "length"
  | "area"
  | "volume"
  | "weight"
  | "speed"
  | "money"
  | "ratio"
  | "elapsed-time" // minute, hour, calendar-day, week
  | "calendar-period" // month, year
  | "business-time" // business-day

export type ValueType =
  | { type: "quantity"; unit: TermKey } // stored in this unit; any unit of the same dimension converts
  | { type: "count" } // whole number, 0 or more
  | { type: "boolean" }
  | { type: "choice"; set: TermKey } // a value term from a value set
  | { type: "date" }
  | { type: "date-time" }
  | { type: "time-of-day" }
  | { type: "schedule" } // recurring days: trash pickup, assessment due dates
  | { type: "text" } // only stated or judged, never compared
  | { type: "reference"; to: TermKey | null } // another thing in the same request: a gate's fence run; null = any thing
  | { type: "party"; among: TermKey[] | null } // a party term, such as the Declarant; among limits which

export type RequestType = {
  flow: "application" | "enforcement" | "filing" | "duty" // what kind of request it is
  governingDate: TermKey | null // the property that sets the governing date; null = the evaluation date
  lot: "required" | "optional" | "none"
}

export type Derivation = { when: Condition | null; value: Operand; citations: Citation[] }

export type TermKind =
  | { kind: "thing"; nature: "party" | "request" | "event" | "document" | "object"; request: RequestType | null }
  | { kind: "category"; of: TermKey; criteria: Condition } // a kind of thing; the criteria decide membership
  | {
      kind: "property"
      of: TermKey
      valueType: ValueType
      many: boolean
      ifUnstated: "unknown" | "absent" // what silence means: height is unknown; lattice is absent (none)
      derived: Derivation[] | null // derived properties are computed, never stated
    }
  | { kind: "value"; set: TermKey; broader: TermKey[] }
  | { kind: "value-set"; complete: boolean } // complete: a value outside it is invalid
  | { kind: "unit"; dimension: Dimension; perBase: string | null } // exact decimal; null: not convertible

export type Term = {
  key: TermKey
  organizationId: Id | null // null: a core term, the same for every organization
  labels: Label[]
  definition: string | null // replaces the term in a rule without changing its meaning
  scopeNote: string | null // where it applies and doesn't
  context: string | null // tells apart terms that share a label
  citations: Citation[]
  provenance: Provenance
  review: Review
  issues: Issue[]
} & TermKind

// ─── Expressions ──────────────────────────────────────────────────────────────────────────────────

export type Root = "subject" | "request" | "lot" | "community"
export type Path = { from?: Root; path: TermKey[] } // follow properties from the root; from defaults to subject

export type Operand =
  | ({ type: "ref" } & Path)
  | { type: "quantity"; value: number; unit: TermKey }
  | { type: "fraction"; numerator: number; denominator: number } // exact: two thirds is 2/3
  | { type: "number"; value: number }
  | { type: "value"; term: TermKey }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: IsoDate }
  | { type: "time"; value: TimeOfDay }
  | { type: "governing-date" } // the request's governing date
  | { type: "sum" | "greatest" | "least"; of: Operand[] }
  | { type: "difference" | "product" | "quotient"; of: [Operand, Operand] }
  | ({ type: "count"; where: Condition | null } & Path) // how many items a many-valued path reaches
  | ({ type: "sum-of" | "greatest-of" | "least-of"; value: TermKey[]; where: Condition | null } & Path) // over those items
  | { type: "shift"; of: Operand; by: Amount } // date arithmetic

export type Comparator = "=" | "!=" | "<" | "<=" | ">" | ">="

export type Offset = { value: number; unit: TermKey; at: TimeOfDay | null } // signed; at pins the time of day

export type TimeWindow =
  | { type: "daily"; from: TimeOfDay; to: TimeOfDay } // to before from wraps past midnight
  | { type: "weekly"; days: Weekday[]; from: TimeOfDay | null; to: TimeOfDay | null }
  | { type: "annual"; from: MonthDay; to: MonthDay } // wraps the year end
  | { type: "recurring"; schedule: Operand; from: Offset | null; to: Offset | null } // around each date of a schedule

export type Condition =
  | { type: "all" | "any"; of: Condition[] }
  | { type: "not"; of: Condition }
  | { type: "compare"; left: Operand; op: Comparator; right: Operand }
  | { type: "in"; left: Operand; values: Operand[] } // a value under a listed value (broader) is in
  | { type: "between"; left: Operand; min: Operand; max: Operand; includeMin: boolean; includeMax: boolean }
  | ({ type: "exists" } & Path) // known: true; absent: false; unknown: unknown
  | ({ type: "is-a"; category: TermKey } & Path)
  | ({ type: "approved" } & ApprovalTest & Path) // the thing at the path was approved: "already approved improvements"
  | ({ type: "every" | "some" | "none"; where: Condition | null; test: Condition } & Path) // item is the subject
  | { type: "during"; start: Operand; end: Operand; window: TimeWindow; match: "within" | "overlaps" }
  | { type: "text"; text: string } // the escape hatch, in applicability only: judged from the request, and counted

// ─── Rules ────────────────────────────────────────────────────────────────────────────────────────

export type Domain = "architectural" | "use" | "maintenance" | "financial" | "governance" | "enforcement" | "general"

export type RuleRemedy = "change-detail" | "redesign" | "none" // what fixes a not-met finding on an application
export type Remedy = "provide-information" | "provide-document" | RuleRemedy // findings; the first two are automatic

export type Cure = {
  value: number // 0: ends on the date at the path
  unit: TermKey
  after: Path // the date the period counts from
  curedBy: Path | null // the date the violation was cured, when the request carries one
}

export type RuleSelection =
  | RuleKey[]
  | { documents: string[]; provisions: ProvisionKey[]; adoptedAfter: Path | null; except: RuleKey[] } // a selector

// Who must approve a thing: every party in by, or any one of them. Approvals arrive as facts from the feature that
// records them, each an approval whose covers references the thing.
export type ApprovalTest = { by: TermKey[]; needs: "all" | "any"; prior: boolean; written: boolean }

export type Sanction = {
  type:
    | "fine"
    | "late-fee"
    | "interest"
    | "charge"
    | "suspension"
    | "self-help"
    | "towing"
    | "lien"
    | "legal-action"
    | "record-notice"
    | "acceleration"
  amounts: Operand[] | "none" | "set-by-imposer" // by occurrence: the first for a first violation, the last after that
  after: { value: number; unit: TermKey; from: Path } | null // available only once this long has passed
  occurrences: {
    within: Amount // earlier violations count for this long
    counts: "same-rule" | "enforced-rules"
    per: "owner" | "lot"
    includesCured: boolean // whether a violation cured within its cure period counts
  } | null
  repeats: { every: Amount; amount: Operand; from: Path | null } | null // from null = when the cure period ends
  cap: Operand | null // total for one violation
  suspends: TermKey[] // privileges: amenity access, voting
  lasts: Amount | { atMost: Amount } | "until-cured" | "until-paid" | null // how long a suspension lasts
}

export type IssueCode =
  | "citation-not-found"
  | "undefined-term"
  | "avoided-label"
  | "type-mismatch"
  | "invalid-value"
  | "ambiguous-label"
  | "conflict"
  | "override-not-allowed"
  | "table-overlap"
  | "text-condition"
  | "absent-in-exception"
  | "undefined-document"
  | "unencoded-quantity"
  | "modality-cue-mismatch"
  | "duplicate-key"
  | "invalid-key"
  | "undefined-rule"
  | "invariant"
  | "coverage"

export type Issue = {
  code: IssueCode
  message: string
  related: RuleKey[]
  resolution: { note: string; by: Id; at: Timestamp } | null
}

export type RuleBase = {
  key: RuleKey
  domain: Domain
  title: string
  statement: string // house style, with term links: "Each {{fence-run}} must …"
  citations: Citation[] // at least one; the first is the main citation
  requestTypes: TermKey[] // the kinds of request it's evaluated in
  appliesTo: TermKey | null // the thing or category it's evaluated on; null only with an overrides selector
  appliesWhen: Condition | null
  scope: { lotId: Id; subjectId: Id | null } | null // decision rules: the lot, and the approved improvement, it covers
  authority: Citation | null // decision rules: the provision granting the power used, such as the variance power
  effectiveFrom: IsoDate // when it took effect: its document's date, or the amendment's that last changed its words
  provenance: Provenance
  review: Review
  issues: Issue[]
}

export type NormRule = RuleBase & {
  kind: "norm"
  modality: "obligation" | "prohibition" | "permission" | "recommendation" | "requirement"
  bearer: TermKey | null // the party that must comply; null for a requirement
  beneficiary: TermKey | null // the party it's owed to or involves
  decidedBy: TermKey | null // required for judgment checks
  overrides: RuleSelection
  noExceptions: Citation | null // the passage that rules out exceptions and variances; only law overrides it
  check: Check | null // null: a permission, or a prohibition of the subject itself
  remedy: RuleRemedy | null // required when the rule is evaluated in applications
  recurs: Operand | null // a schedule: one compliance-period request per date, for duties nobody files
  cure: Cure | "none" | null // null = the organization's default
}

export type DiscretionRule = RuleBase & {
  kind: "discretion" // "considered case by case", "variations may be considered"
  decidedBy: TermKey
  overrides: RuleSelection
}

export type SanctionRule = RuleBase & {
  kind: "sanction"
  modality: "obligation" | "permission" // shall impose, or may impose
  enforces: { rules: RuleKey[]; documents: string[]; except: RuleKey[] } // rules, and whole documents by key
  against: TermKey[] // the parties it can be imposed on; the liability settings add whoever answers for them
  imposedBy: TermKey
  sanction: Sanction
}

export type LimitRule = RuleBase & {
  kind: "limit" // law or a higher document limiting sanctions while its conditions hold
  limits: RuleKey[] // sanction rules
  forbids: boolean
  maxAmount: Operand | null // per occurrence
  maxTotal: Operand | null // per violation
}

export type Rule = NormRule | DiscretionRule | SanctionRule | LimitRule

// ─── Checks ───────────────────────────────────────────────────────────────────────────────────────

export type Cell =
  | { type: "any" }
  | { type: "in" | "not-in"; values: Operand[] }
  | { type: "range"; min: Operand | null; max: Operand | null; includeMin: boolean; includeMax: boolean }

export type Effect = { type: "deems"; target: Path; value: Operand } // reported on the finding, never written

export type Check =
  | { type: "test"; test: Condition } // true = complies
  | {
      type: "table"
      inputs: Operand[]
      rows: { when: Cell[]; result: "met" | "not-met"; citation: Citation | null }[] // rows never overlap
      otherwise: "met" | "not-met"
    }
  | { type: "document"; document: TermKey; per: "request" | "subject"; mustState: string[]; signedBy: TermKey[] }
  | {
      type: "deadline"
      act: Operand // the date the required act happened; not recorded = not yet
      anchor: Operand // the date the window is measured from, or a schedule: one window per date
      earliest: Offset | null
      latest: Offset | null
      onMiss: Effect[]
    }
  | { type: "judgment"; question: string; evidence: TermKey[] } // phrased so that "yes" complies
  | ({ type: "approval" } & ApprovalTest) // the subject was approved

// ─── Organization settings ────────────────────────────────────────────────────────────────────────

export type RecommendedAction = "approve-with-conditions" | "deny" | "request-information" | "refer-to-committee"

export type Settings = {
  clauses: {
    precedence: { order: DocumentKind[][]; citations: Citation[] } // earlier wins; one inner list = equal rank
    time: { days: TermKey; rollForward: boolean; holidays: string; zone: string; citations: Citation[] }
    liability: {
      actor: TermKey
      liable: TermKey // answers for the actor's sanctions too
      appliesWhen: Condition | null // with the sanction's request as subject
      until: Path | null // a date it ends on: a seller is liable until the board receives notice of the sale
      except: RuleSelection // sanctions it doesn't extend to
      citations: Citation[]
    }[]
    cure: (Cure & { citations: Citation[] }) | null // the default cure period; null = none
    deciders: { requestType: TermKey; party: TermKey; citations: Citation[] }[] // who decides each request type: the Reviewer decides applications
    sanctionPreconditions: {
      requestTypes: TermKey[] // the sanctions in these request types need it first
      condition: Condition // with the request as subject: notice delivered, a hearing held if one was requested
      except: RuleSelection // sanctions that don't: emergency self-help, towing
      citations: Citation[]
    }[]
  }
  policy: {
    decisionPolicy: Record<RuleRemedy, RecommendedAction>
    thresholds: { factConfidence: number; judgmentConfidence: number }
  }
  review: Review
  issues: Issue[]
}

// ─── Questions ────────────────────────────────────────────────────────────────────────────────────

export type Question = {
  id: Id
  kind: "interpretation" | "conflict"
  question: string
  citations: Citation[]
  about: { rules: RuleKey[]; terms: TermKey[] }
  options: { label: string; keeps: RuleKey[] }[] // each reading keeps different candidate rules
  answer: { option: number | null; text: string | null; by: Id; at: Timestamp } | null
}

// ─── Evaluation: what goes in, what comes out ─────────────────────────────────────────────────────

export type FactValue =
  | { type: "quantity"; value: number; unit: TermKey }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "value"; term: TermKey | null; text: string } // term null: a value no term matches (open sets only)
  | { type: "date"; value: IsoDate }
  | { type: "date-time"; value: Timestamp }
  | { type: "time"; value: TimeOfDay }
  | {
      type: "schedule"
      weekly: Weekday[]
      annual: MonthDay[]
      every: { value: number; unit: TermKey; from: IsoDate } | null
    }
  | { type: "text"; value: string }
  | { type: "entity"; entity: string }

export type Evidence = { fileId: Id; page: number | null; quote: string | null; region: number[] | null }

export type Fact = {
  entity: string
  property: TermKey
  state: "known" | "absent" | "conflicting" | "uncertain" // no fact at all = unknown
  value: FactValue | null
  candidates: FactValue[] // the readings behind conflicting or uncertain
  complete: boolean | null // many-valued properties: true when the values are the whole list
  stated: string | null // as written: "6'"
  evidence: Evidence[]
  confidence: number | null
  provenance: Provenance
}

export type EvaluationRequest = {
  organizationId: Id
  type: TermKey // a core thing of nature "request": "architectural-application", "violation", "lease-registration"
  governingDate: IsoDate // the date the request is judged as of; rules apply from their effectiveFrom
  evaluationDate: IsoDate // used only by deadlines and cure periods
  lot: string | null // the entity that is the lot it concerns
  entities: { id: string; type: TermKey; label: string; ref: string | null }[] // ref: its id where it came from
  facts: Fact[]
  documents: { id: Id; type: TermKey; subjects: string[]; signedBy: string[] }[] // the requester's files, classified
}

export type Outcome =
  | "met"
  | "not-met"
  | "advisory"
  | "missing-information"
  | "committee"
  | "pending"
  | "exempt"
  | "not-applicable"
  | "available"
  | "blocked"

export type Finding = {
  ruleKey: RuleKey
  entity: string
  outcome: Outcome
  remedy: Remedy | null
  reason: string
  inputs: { entity: string; property: TermKey; state: Fact["state"] | "unknown" | "derived" }[] // every fact it read
  modifiedBy: { ruleKey: RuleKey; effect: "displaced" | "exempt" | "decided-by" | "limited" }[]
  judgment: { answer: "yes" | "no" | "unclear"; confidence: number; rationale: string; evidence: Evidence[] } | null
  statements: { statement: string; confirmed: boolean | null; quote: string | null }[] // a document check's mustState
  effects: { target: Path; value: FactValue; from: IsoDate }[] // what a missed deadline deems, from when the window closed
  sanction: { enforced: RuleKey; occurrence: number | null; amount: Amount | null } | null
  asOf: IsoDate
  evaluatedAt: Timestamp
}

// ─── Rules file ───────────────────────────────────────────────────────────────────────────────────

export type RulesFile = {
  organization: { id: Id; name: string }
  documents: GoverningDocument[]
  provisions: Provision[]
  terms: Term[] // the organization's terms and refinements; core terms ship with the portal
  proposedCore: Term[] // core terms extraction needed that the portal doesn't have yet
  rules: Rule[]
  settings: Settings
  questions: Question[]
}
