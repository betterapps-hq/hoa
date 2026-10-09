import { describe, expect, it } from "vitest"
import type { CommitteeMeeting, DashboardApplication } from "./dashboardData"
import {
  agoText,
  awaitingDecision,
  awaitingHomeowner,
  daysBetween,
  daysText,
  groupForHomeowner,
  nextStepText,
  standingText,
  waitingSince
} from "./dashboardDisplay"

const application = (overrides: Partial<DashboardApplication>): DashboardApplication => ({
  id: "a",
  projectTypeLabel: "Deck",
  description: "A deck.",
  status: "draft",
  updatedAt: "2026-10-01T15:00:00.000Z",
  submittedAt: null,
  recommendation: null,
  decision: null,
  informationRequest: null,
  applicant: { name: "A. Person", address: "1 Any Street" },
  meetingId: null,
  ...overrides
})

const meeting: CommitteeMeeting = {
  id: "m",
  title: "Architectural committee",
  startsAt: "2026-10-14T19:00:00.000Z",
  location: "Clubhouse",
  submissionDeadline: null
}

describe("nextStepText", () => {
  it("tells the homeowner what to do while the application is theirs", () => {
    expect(nextStepText(application({ status: "draft" }), null)).toBe("Add your plans and run the review.")
    expect(nextStepText(application({ status: "reviewed", recommendation: "approve" }), null)).toBe(
      "The review found no problems. Submit it to the committee."
    )
    expect(nextStepText(application({ status: "reviewed", recommendation: "deny" }), null)).toBe(
      "Check what the review found, then submit it to the committee."
    )
    expect(
      nextStepText(
        application({
          status: "information-requested",
          informationRequest: { text: "Send a paint chip.", requestedAt: "2026-10-07T00:00:00.000Z" }
        }),
        null
      )
    ).toBe("Send a paint chip.")
  })

  it("names the meeting a submitted application is on", () => {
    expect(nextStepText(application({ status: "submitted" }), meeting)).toBe("On the agenda for Wednesday, Oct 14.")
    expect(nextStepText(application({ status: "submitted" }), null)).toBe("With the committee for a decision.")
  })

  it("follows the decision", () => {
    const decided = (outcome: NonNullable<DashboardApplication["decision"]>["outcome"]) =>
      application({ status: "decided", decision: { outcome, decidedAt: "2026-10-01T00:00:00.000Z" } })
    expect(nextStepText(decided("approved"), null)).toBe("You can start the work.")
    expect(nextStepText(decided("approved-with-conditions"), null)).toBe(
      "Read the decision's conditions before work starts."
    )
    expect(nextStepText(decided("disapproved"), null)).toMatch(/apply again/)
    expect(standingText(decided("approved-with-conditions"))).toBe("Approved with conditions")
  })
})

describe("grouping", () => {
  it("puts what waits on the homeowner first and leaves out empty groups", () => {
    const groups = groupForHomeowner([
      application({ id: "decided", status: "decided" }),
      application({ id: "draft", status: "draft" }),
      application({ id: "asked", status: "information-requested" })
    ])
    expect(groups.map((group) => [group.title, group.applications.map((item) => item.id)])).toEqual([
      ["Waiting on you", ["asked", "draft"]],
      ["Decided", ["decided"]]
    ])
  })

  it("orders the committee's queues by how long each has waited", () => {
    const asked = application({
      id: "asked",
      status: "information-requested",
      submittedAt: "2026-09-01T00:00:00.000Z",
      informationRequest: { text: "Send a plan.", requestedAt: "2026-10-02T00:00:00.000Z" }
    })
    const applications = [
      application({ id: "new", status: "submitted", submittedAt: "2026-10-08T00:00:00.000Z" }),
      application({ id: "old", status: "submitted", submittedAt: "2026-09-20T00:00:00.000Z" }),
      asked
    ]
    expect(awaitingDecision(applications).map((item) => item.id)).toEqual(["old", "new"])
    expect(awaitingHomeowner(applications).map((item) => item.id)).toEqual(["asked"])
    expect(waitingSince(asked)).toBe("2026-10-02T00:00:00.000Z")
  })
})

describe("time phrasing", () => {
  it("counts whole days and says them plainly", () => {
    expect(daysBetween("2026-09-20T15:00:00.000Z", "2026-10-09T12:00:00.000Z")).toBe(19)
    expect(daysBetween("2026-10-08T23:00:00.000Z", "2026-10-09T01:00:00.000Z")).toBe(1)
    expect(daysText(0)).toBe("Today")
    expect(daysText(1)).toBe("1 day")
    expect(daysText(19)).toBe("19 days")
  })

  it("says how long ago something happened", () => {
    const asOf = "2026-10-09T12:00:00.000Z"
    expect(agoText("2026-10-09T11:30:00.000Z", asOf)).toBe("just now")
    expect(agoText("2026-10-09T10:00:00.000Z", asOf)).toBe("2 hours ago")
    expect(agoText("2026-10-08T23:00:00.000Z", asOf)).toBe("yesterday")
    expect(agoText("2026-10-03T10:00:00.000Z", asOf)).toBe("6 days ago")
  })
})
