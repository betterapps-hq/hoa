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
  unit("inch", "length", "1", "in", "inch", "inches", '"', "″"),
  unit("foot", "length", "12", "ft", "feet", "foot", "'", "′"),
  unit("usd", "money", "1", "$", "dollars", "USD"),
  unit("percent", "ratio", "0.01", "%", "percent"),
  unit("calendar-day", "elapsed-time", "1", "days", "calendar days"),
  unit("business-day", "business-time", null, "business days"),
  unit("month", "calendar-period", "1", "months"),
  unit("year", "calendar-period", "12", "years")
]
