import type { Dimension, Label, Provenance, RequestType, Review, Term, ValueType } from "./types"

// The core vocabulary (schema.md, Core and organization terms): the terms portal code reads or writes, the same for
// every organization. An organization refines one by defining a term with the same key.

const system: Provenance = { by: "system", at: "2026-10-09T00:00:00Z" }
const approved: Review = { status: "approved", by: null, at: null, note: null }
const bookkeeping = {
  definition: null,
  scopeNote: null,
  context: null,
  citations: [],
  provenance: system,
  review: approved,
  issues: []
}

const labels = (preferred: string, ...alternatives: string[]): Label[] =>
  [preferred, ...alternatives].map((text, index) => ({
    text,
    role: index === 0 ? "preferred" : "alternative",
    plural: null,
    citation: null,
    provenance: system
  }))

type Nature = Extract<Term, { kind: "thing" }>["nature"]

const thing = (key: string, nature: Nature, ...names: [string, ...string[]]): Term => ({
  key,
  organizationId: null,
  kind: "thing",
  nature,
  request: null,
  labels: labels(...names),
  ...bookkeeping
})

const requestThing = (key: string, label: string, request: RequestType): Term => ({
  key,
  organizationId: null,
  kind: "thing",
  nature: "request",
  request,
  labels: labels(label),
  ...bookkeeping
})

const property = (
  key: string,
  valueType: ValueType,
  label: string,
  ifUnstated: "unknown" | "absent" = "unknown"
): Term => ({
  key,
  organizationId: null,
  kind: "property",
  of: key.slice(0, key.lastIndexOf(".")),
  valueType,
  many: false,
  ifUnstated,
  derived: null,
  labels: labels(label),
  ...bookkeeping
})

const valueSet = (key: string, label: string, complete: boolean): Term => ({
  key,
  organizationId: null,
  kind: "value-set",
  complete,
  labels: labels(label),
  ...bookkeeping
})

const value = (key: string, label: string): Term => ({
  key,
  organizationId: null,
  kind: "value",
  set: key.slice(0, key.lastIndexOf(".")),
  broader: [],
  labels: labels(label),
  ...bookkeeping
})

const unit = (key: string, dimension: Dimension, perBase: string | null, ...names: [string, ...string[]]): Term => ({
  key,
  organizationId: null,
  kind: "unit",
  dimension,
  perBase,
  labels: labels(...names),
  ...bookkeeping
})

/**
 * The documents the portal's own application form provides: the form itself (its answers) and the project's
 * description. An organization's document kind is one of them when it refines it: the same key, or a category of it.
 */
export const formDocumentKinds = ["application-form", "project-description"] as const
export type FormDocumentKind = (typeof formDocumentKinds)[number]

const date: ValueType = { type: "date" }
const count: ValueType = { type: "count" }
const choice = (set: string): ValueType => ({ type: "choice", set })

export const coreTerms: Term[] = [
  thing("owner", "party", "owner"),
  thing("tenant", "party", "tenant"),
  thing("guest", "party", "guest"),
  thing("occupant", "party", "occupant"),
  thing("applicant", "party", "applicant"),
  thing("organization", "party", "organization"),
  thing("members", "party", "members"),
  thing("board", "party", "board"),
  thing("committee", "party", "architectural review committee", "ARC"),
  thing("community", "object", "community"),
  thing("lot", "object", "lot"),
  property("community.lot-count", count, "number of lots"),
  property("community.leased-lots", count, "leased lots"),
  property("community.total-voting-power", count, "total votes"),
  requestThing("architectural-application", "application", {
    flow: "application",
    governingDate: "architectural-application.submitted-on",
    lot: "required"
  }),
  property("architectural-application.submitted-on", date, "submitted on"),
  property("architectural-application.decided-on", date, "decided on"),
  property("architectural-application.decision", choice("decision-status"), "decision"),
  valueSet("decision-status", "decision status", true),
  value("decision-status.approved", "approved"),
  requestThing("violation", "violation", {
    flow: "enforcement",
    governingDate: "violation.observed-on",
    lot: "optional"
  }),
  property("violation.observed-on", date, "observed on"),
  property("violation.notice-delivered-on", date, "notice delivered on"),
  property("violation.cured-on", date, "cured on"),
  property("violation.hearing-requested-on", date, "hearing requested on", "absent"),
  property("violation.hearing-held-on", date, "hearing held on", "absent"),
  property("violation.occurrence", count, "occurrence"),
  requestThing("assessment", "assessment", {
    flow: "enforcement",
    governingDate: "assessment.due-on",
    lot: "required"
  }),
  property("assessment.due-on", date, "due on"),
  property("community.annual-meeting", { type: "schedule" }, "annual meeting schedule"),
  property("assessment.paid-on", date, "paid on"),
  property("assessment.unpaid-balance", { type: "quantity", unit: "usd" }, "unpaid balance"),
  requestThing("lease-registration", "lease registration", {
    flow: "filing",
    governingDate: "lease-registration.received-on",
    lot: "required"
  }),
  property("lease-registration.received-on", date, "received on"),
  property("lease-registration.term", { type: "quantity", unit: "month" }, "lease term"),
  requestThing("meeting", "meeting", { flow: "filing", governingDate: "meeting.starts-at", lot: "none" }),
  property("meeting.starts-at", { type: "date-time" }, "starts at"),
  property("meeting.notice-sent-on", date, "notice sent on"),
  property("meeting.voting-power-present", count, "votes present"),
  thing("vote", "event", "vote"),
  property("vote.subject", choice("vote-subject"), "subject"),
  valueSet("vote-subject", "vote subject", false),
  value("vote-subject.declaration-amendment", "amendment to the Declaration"),
  property("vote.in-favor", count, "votes in favor"),
  requestThing("records-request", "records request", {
    flow: "filing",
    governingDate: "records-request.received-on",
    lot: "none"
  }),
  property("records-request.received-on", date, "received on"),
  property("records-request.produced-on", date, "produced on"),
  requestThing("nomination", "board nomination", { flow: "filing", governingDate: "nomination.filed-on", lot: "none" }),
  property("nomination.filed-on", date, "filed on"),
  property("nomination.ownership-start", date, "owner since"),
  requestThing("compliance-period", "compliance period", {
    flow: "duty",
    governingDate: "compliance-period.scheduled-on",
    lot: "none"
  }),
  property("compliance-period.scheduled-on", date, "scheduled on"),
  property("compliance-period.completed-on", date, "completed on"),
  thing("approval", "event", "approval"),
  property("approval.by", { type: "party", among: null }, "approved by"),
  property("approval.covers", { type: "reference", to: null }, "covers"),
  property("approval.status", choice("approval-status"), "status"),
  valueSet("approval-status", "approval status", true),
  value("approval-status.approved", "approved"),
  value("approval-status.denied", "denied"),
  property("approval.on", date, "decided on"),
  property("approval.written", { type: "boolean" }, "in writing"),
  thing("work", "object", "work"),
  thing("application-form", "document", "application form"),
  thing("project-description", "document", "project description"),

  // What nearly every association's documents name, the same way everywhere (taxonomy-ingestion.md, Core terms): each
  // is in the rule-bearing provisions of at least 8 of the 10 organizations studied and means the same in all of them.
  // Names only: what an organization's documents say about them (heights, materials, kinds) stays its own until builds
  // agree on it. Left out until they do: notice (often defined as one particular notice, such as a claim's), and
  // structure, improvement, fence, wall and sign (modeled differently by the sample and by builds).
  thing("declaration", "document", "declaration", "CC&Rs", "covenants"),
  thing("by-laws", "document", "by-laws", "bylaws"),
  thing("rules", "document", "rules and regulations", "rules"),
  thing("plat", "document", "plat", "recorded map"),
  thing("amendment", "event", "amendment"),
  thing("declarant", "party", "declarant", "developer"),
  thing("managing-agent", "party", "managing agent", "manager", "management company"),
  thing("residence", "object", "residence", "dwelling", "home", "living unit"),
  thing("common-area", "object", "common area", "common property"),
  thing("street", "object", "street", "road"),
  thing("easement", "object", "easement"),
  thing("landscaping", "object", "landscaping"),
  thing("tree", "object", "tree"),
  thing("vehicle", "object", "vehicle"),
  thing("animal", "object", "animal"),
  valueSet("animal-kind", "kind of animal", false),
  value("animal-kind.dog", "dog"),
  value("animal-kind.cat", "cat"),
  value("animal-kind.livestock", "livestock"),
  value("animal-kind.poultry", "poultry"),
  thing("lease", "document", "lease", "rental agreement"),
  thing("lien", "object", "lien"),
  thing("reserve-fund", "object", "reserve fund", "reserves"),

  // Units. Each dimension's base is its smallest metric unit, so every US and metric unit converts by an exact
  // decimal (an inch is 25.4 millimeters exactly); people only ever see the unit a rule or answer is written in.
  unit("millimeter", "length", "1", "mm", "millimeter", "millimeters"),
  unit("centimeter", "length", "10", "cm", "centimeter", "centimeters"),
  unit("meter", "length", "1000", "m", "meter", "meters"),
  unit("kilometer", "length", "1000000", "km", "kilometer", "kilometers"),
  unit("inch", "length", "25.4", "in", "inch", "inches", '"', "″"),
  unit("foot", "length", "304.8", "ft", "feet", "foot", "'", "′"),
  unit("yard", "length", "914.4", "yd", "yard", "yards"),
  unit("mile", "length", "1609344", "mi", "mile", "miles"),
  unit("square-millimeter", "area", "1", "mm²", "square millimeters"),
  unit("square-meter", "area", "1000000", "m²", "square meter", "square meters", "sq m"),
  unit("hectare", "area", "10000000000", "ha", "hectare", "hectares"),
  unit("square-inch", "area", "645.16", "sq in", "square inch", "square inches", "in²"),
  unit("square-foot", "area", "92903.04", "sq ft", "square foot", "square feet", "ft²"),
  unit("square-yard", "area", "836127.36", "sq yd", "square yard", "square yards", "yd²"),
  unit("acre", "area", "4046856422.4", "acre", "acres"),
  unit("square-mile", "area", "2589988110336", "sq mi", "square mile", "square miles", "mi²"),
  unit("milliliter", "volume", "1", "ml", "milliliter", "milliliters"),
  unit("liter", "volume", "1000", "L", "liter", "liters"),
  unit("cubic-meter", "volume", "1000000", "m³", "cubic meter", "cubic meters"),
  unit("fluid-ounce", "volume", "29.5735295625", "fl oz", "fluid ounce", "fluid ounces"),
  unit("quart", "volume", "946.352946", "qt", "quart", "quarts"),
  unit("gallon", "volume", "3785.411784", "gal", "gallon", "gallons"),
  unit("cubic-foot", "volume", "28316.846592", "cu ft", "cubic foot", "cubic feet", "ft³"),
  unit("cubic-yard", "volume", "764554.857984", "cu yd", "cubic yard", "cubic yards", "yd³"),
  unit("milligram", "weight", "1", "mg", "milligram", "milligrams"),
  unit("gram", "weight", "1000", "g", "gram", "grams"),
  unit("kilogram", "weight", "1000000", "kg", "kilogram", "kilograms"),
  unit("ounce", "weight", "28349.523125", "oz", "ounce", "ounces"),
  unit("pound", "weight", "453592.37", "lb", "pound", "pounds", "lbs"),
  unit("ton", "weight", "907184740", "ton", "tons"),
  unit("kilometers-per-hour", "speed", "1000000", "km/h", "kilometers per hour"),
  unit("miles-per-hour", "speed", "1609344", "mph", "miles per hour"),
  unit("usd", "money", "1", "$", "dollars", "USD"),
  unit("cent", "money", "0.01", "¢", "cents"),
  unit("percent", "ratio", "0.01", "%", "percent"),
  unit("second", "elapsed-time", "1", "seconds"),
  unit("minute", "elapsed-time", "60", "minutes"),
  unit("hour", "elapsed-time", "3600", "hours"),
  unit("calendar-day", "elapsed-time", "86400", "days", "calendar days"),
  unit("week", "elapsed-time", "604800", "weeks"),
  unit("business-day", "business-time", null, "business days"),
  unit("month", "calendar-period", "1", "months"),
  unit("quarter", "calendar-period", "3", "quarters"),
  unit("year", "calendar-period", "12", "years"),
  unit("decibel", "sound-level", "1", "dB", "decibels")
]
