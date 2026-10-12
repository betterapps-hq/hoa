import { describe, expect, it } from "vitest"
import * as ex from "@/schema/examples.test-data"
import type { Check, EvaluationRequest, Operand } from "@/schema/types"
import { date, dateTime, exampleContext, fact } from "@/tests/engineContext"
import { evaluateDeadline } from "./deadlines"

type Deadline = Extract<Check, { type: "deadline" }>
const request = { subject: { type: "entity" as const, id: "request" } }

function deadlineOf(rule: { check?: Check | null }): Deadline {
  if (rule.check?.type !== "deadline") {
    throw new Error("not a deadline example")
  }
  return rule.check
}

const evaluateIn = (parts: Partial<EvaluationRequest>, check: Deadline) =>
  evaluateDeadline(exampleContext(parts), request, check)

describe("the committee decides within 30 days (deemed approved if it doesn't)", () => {
  const check = deadlineOf(ex.committeeResponse)
  const application = (evaluationDate: string, ...facts: ReturnType<typeof fact>[]) => ({
    type: "architectural-application",
    evaluationDate,
    facts: [fact("request", "architectural-application.submitted-on", date("2026-01-02")), ...facts]
  })
  const decided = (value: string) => fact("request", "architectural-application.decided-on", date(value))

  it("complies when decided inside the window", () => {
    expect(evaluateIn(application("2026-03-01", decided("2026-01-20")), check)).toEqual({
      status: "complies",
      effects: []
    })
  })

  it("fails when decided late, reporting what the miss deems from the day the window closed", () => {
    // Thirty days after January 2 is Sunday February 1, which rolls forward to Monday February 2.
    expect(evaluateIn(application("2026-03-01", decided("2026-02-10")), check)).toEqual({
      status: "fails",
      effects: [
        {
          target: { from: "request", path: ["architectural-application.decision"] },
          value: { type: "value", term: "decision-status.approved", text: "approved" },
          from: "2026-02-02"
        }
      ]
    })
    expect(evaluateIn(application("2026-03-01", decided("2026-02-02")), check).status).toBe("complies")
  })

  it("is pending until the window ends, then unknown when silence means unknown", () => {
    expect(evaluateIn(application("2026-01-15"), check).status).toBe("pending")
    expect(evaluateIn(application("2026-02-10"), check).status).toBe("unknown")
  })

  it("fails after the window when the act is stated as not done", () => {
    const notDecided = fact("request", "architectural-application.decided-on", null, "absent")
    expect(evaluateIn(application("2026-01-15", notDecided), check).status).toBe("pending")
    expect(evaluateIn(application("2026-02-10", notDecided), check).status).toBe("fails")
  })

  it("is unknown when the act is unclear or the anchor unknown", () => {
    const unclear = fact("request", "architectural-application.decided-on", date("2026-01-20"), "conflicting")
    expect(evaluateIn(application("2026-01-15", unclear), check).status).toBe("unknown")
    expect(evaluateIn({ type: "architectural-application" }, check).status).toBe("unknown")
  })
})

describe("meeting notice 10 to 60 days ahead", () => {
  const check = deadlineOf(ex.meetingNotice)
  const meeting = (sent: string) => ({
    type: "meeting",
    facts: [
      fact("request", "meeting.starts-at", dateTime("2026-03-20T18:00:00Z")),
      fact("request", "meeting.notice-sent-on", date(sent))
    ]
  })

  it("takes a window before its anchor", () => {
    expect(evaluateIn(meeting("2026-03-01"), check).status).toBe("complies")
    expect(evaluateIn(meeting("2026-03-15"), check).status).toBe("fails")
    expect(evaluateIn(meeting("2026-01-01"), check).status).toBe("fails")
  })
})

describe("records produced within 10 business days", () => {
  const check = deadlineOf(ex.recordsRequest)
  const records = (produced: string) => ({
    type: "records-request",
    facts: [
      fact("request", "records-request.received-on", date("2026-06-26")),
      fact("request", "records-request.produced-on", date(produced))
    ]
  })

  it("skips weekends and the observed Independence Day", () => {
    expect(evaluateIn(records("2026-07-13"), check).status).toBe("complies")
    expect(evaluateIn(records("2026-07-14"), check).status).toBe("fails")
  })
})

describe("windows around a schedule, a time of day, and other acts", () => {
  const completed = (value: string) => fact("request", "compliance-period.completed-on", date(value))
  const annualMeeting = (anchor: Operand): Deadline => ({
    type: "deadline",
    act: { type: "ref", from: "request", path: ["compliance-period.completed-on"] },
    anchor,
    earliest: null,
    latest: { value: 30, unit: "calendar-day", at: null },
    onMiss: []
  })
  const schedule = { type: "ref" as const, from: "community" as const, path: ["community.annual-meeting"] }
  const duty = (...facts: ReturnType<typeof fact>[]) => ({
    type: "compliance-period",
    governingDate: "2026-04-01",
    facts: [
      fact("community", "community.annual-meeting", { type: "schedule", weekly: [], annual: ["03-15"], every: null }),
      ...facts
    ]
  })

  it("measures from a schedule's occurrence on or before the governing date", () => {
    expect(evaluateIn(duty(completed("2026-04-10")), annualMeeting(schedule)).status).toBe("complies")
    expect(evaluateIn(duty(completed("2026-04-20")), annualMeeting(schedule)).status).toBe("fails")
    expect(evaluateIn({ type: "compliance-period" }, annualMeeting(schedule)).status).toBe("unknown")
  })

  it("pins a bound to a time of day", () => {
    const byFive: Deadline = {
      type: "deadline",
      act: { type: "ref", from: "request", path: ["meeting.starts-at"] },
      anchor: { type: "date", value: "2026-02-03" },
      earliest: { value: 0, unit: "calendar-day", at: "09:00" },
      latest: { value: 0, unit: "calendar-day", at: "17:00" },
      onMiss: [
        { type: "deems", target: { from: "request", path: ["meeting.starts-at"] }, value: { type: "ref", path: [] } }
      ]
    }
    const at = (value: string) => ({ type: "meeting", facts: [fact("request", "meeting.starts-at", dateTime(value))] })
    // Chicago is six hours behind UTC in February.
    expect(evaluateIn(at("2026-02-03T22:00:00Z"), byFive).status).toBe("complies")
    expect(evaluateIn(at("2026-02-03T23:30:00Z"), byFive)).toEqual({ status: "fails", effects: [] })
    expect(evaluateIn(at("2026-02-03T14:00:00Z"), byFive).status).toBe("fails")
  })

  it("reads an act that isn't a path, and is unknown for an offset that isn't time", () => {
    const constant: Deadline = {
      ...annualMeeting({ type: "date", value: "2026-03-15" }),
      act: { type: "date", value: "2026-03-20" }
    }
    expect(evaluateIn(duty(), constant).status).toBe("complies")
    const unknownAct: Deadline = {
      ...constant,
      act: {
        type: "shift",
        of: { type: "ref", from: "request", path: ["compliance-period.completed-on"] },
        by: { value: 1, unit: "usd" }
      }
    }
    expect(evaluateIn(duty(), unknownAct).status).toBe("pending")
    const notTime: Deadline = { ...constant, latest: { value: 1, unit: "usd", at: null } }
    expect(evaluateIn(duty(), notTime).status).toBe("unknown")
  })
})
