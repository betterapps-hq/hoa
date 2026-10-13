import { describe, expect, it } from "vitest"
import { dashboardApplication as application, decision } from "./dashboard.test-data"
import {
  agoText,
  awaitingDecision,
  awaitingHomeowner,
  daysBetween,
  daysText,
  elsewhereText,
  nextStepText,
  recentActivity,
  recommendationText,
  standingDateText,
  standingText,
  waitingOnHomeowner,
  waitingSince
} from "./dashboardDisplay"

const asOf = "2026-10-09T12:00:00.000Z"
const reviewed = (recommendation: "approve" | "deny" | "request-information") => [
  { recommendation, createdAt: "2026-10-03T10:00:00.000Z" }
]

describe("nextStepText", () => {
  it("tells the homeowner what to do while the application is theirs", () => {
    expect(nextStepText(application({ status: "draft" }))).toBe("Finish your draft and run the review.")
    expect(nextStepText(application({ status: "reviewed", reviews: reviewed("approve") }))).toBe(
      "The review found no problems. Submit it to the committee."
    )
    expect(nextStepText(application({ status: "reviewed", reviews: reviewed("deny") }))).toBe(
      "Check what the review found, then submit it to the committee."
    )
  })

  it("asks for the review again once the homeowner changes the application after it", () => {
    const changed = application({
      status: "reviewed",
      reviews: reviewed("request-information"),
      revisedAt: "2026-10-04T00:00:00.000Z",
      missingInformation: ["A plan."]
    })
    expect(nextStepText(changed)).toBe("You changed it after the review. Run the review again, then submit it.")
    expect(standingText(changed)).toBe("Draft")
  })

  it("asks for what the review's action items ask for", () => {
    expect(
      nextStepText(
        application({ status: "reviewed", reviews: reviewed("request-information"), missingInformation: ["A plan."] })
      )
    ).toBe("Add the one thing the review asks for, then submit it to the committee.")
    expect(nextStepText(application({ status: "reviewed", missingInformation: ["A plan.", "A photo."] }))).toMatch(
      /^Add the 2 things/
    )
  })

  it("passes on what the committee asked for", () => {
    const asked = decision("information-requested", "2026-10-07T00:00:00.000Z", "Send a paint chip.")
    expect(nextStepText(application({ status: "information-requested", decision: asked }))).toBe("Send a paint chip.")
    expect(
      nextStepText(application({ status: "information-requested", decision: decision("information-requested", asOf) }))
    ).toBe("The committee needs more information.")
    expect(nextStepText(application({ status: "submitted" }))).toBe("With the committee for a decision.")
  })

  it("follows the decision", () => {
    const decided = (outcome: Parameters<typeof decision>[0]) =>
      application({ status: "decided", decision: decision(outcome, "2026-10-01T00:00:00.000Z") })
    expect(nextStepText(decided("approved"))).toBe("You can start the work.")
    expect(nextStepText(decided("approved-with-conditions"))).toBe("Read the decision's conditions before work starts.")
    expect(nextStepText(decided("disapproved"))).toMatch(/apply again/)
    expect(standingText(decided("approved-with-conditions"))).toBe("Approved with conditions")
  })
})

describe("standing", () => {
  it("dates where the application stands from its record", () => {
    expect(standingDateText(application({ status: "draft" }), asOf)).toBe("Started Oct 1.")
    expect(standingDateText(application({ status: "reviewed", reviews: reviewed("approve") }), asOf)).toBe(
      "Reviewed Oct 3."
    )
    expect(standingDateText(application({ status: "submitted", submittedAt: "2026-10-04T00:00:00.000Z" }), asOf)).toBe(
      "Submitted Oct 4."
    )
    expect(
      standingDateText(
        application({
          status: "information-requested",
          decision: decision("information-requested", "2026-10-07T09:00:00.000Z")
        }),
        asOf
      )
    ).toBe("Asked 2 days ago.")
  })

  it("names the latest review's recommendation", () => {
    expect(recommendationText(application({ reviews: reviewed("approve") }))).toBe("Review: approve")
    expect(recommendationText(application())).toBe("Not reviewed")
  })
})

describe("grouping", () => {
  it("keeps what waits on the homeowner, what the committee asked for first", () => {
    const waiting = waitingOnHomeowner([
      application({ id: "decided", status: "decided" }),
      application({ id: "draft", status: "draft" }),
      application({ id: "reviewed", status: "reviewed" }),
      application({ id: "asked", status: "information-requested" }),
      application({ id: "submitted", status: "submitted" })
    ])
    expect(waiting.map((item) => item.id)).toEqual(["asked", "reviewed", "draft"])
  })

  it("says where the homeowner's other applications stand", () => {
    const elsewhere = [
      application({ status: "reviewing" }),
      application({ status: "submitted" }),
      application({ status: "decided" }),
      application({ status: "decided" })
    ]
    expect(elsewhereText([application(), ...elsewhere])).toBe(
      "Of your other applications, 1 is being reviewed, 1 is with the committee and 2 are decided."
    )
    expect(elsewhereText(elsewhere.slice(1, 2))).toBe("Of your applications, 1 is with the committee.")
    expect(elsewhereText([application()])).toBeNull()
  })

  it("orders the committee's queues by how long each has waited", () => {
    const asked = application({
      id: "asked",
      status: "information-requested",
      submittedAt: "2026-09-01T00:00:00.000Z",
      decision: decision("information-requested", "2026-10-02T00:00:00.000Z", "Send a plan.")
    })
    const applications = [
      application({ id: "new", status: "submitted", submittedAt: "2026-10-08T00:00:00.000Z" }),
      application({ id: "old", status: "submitted", submittedAt: "2026-09-20T00:00:00.000Z" }),
      application({ id: "draft" }),
      asked
    ]
    expect(awaitingDecision(applications).map((item) => item.id)).toEqual(["old", "new"])
    expect(awaitingHomeowner(applications).map((item) => item.id)).toEqual(["asked"])
    expect(waitingSince(asked)).toBe("2026-10-02T00:00:00.000Z")
  })
})

describe("recentActivity", () => {
  it("lists the records' events newest first, up to the limit", () => {
    const fence = application({
      id: "fence",
      projectTypeLabel: "Fence",
      createdAt: "2026-10-01T00:00:00.000Z",
      reviews: [{ recommendation: "approve", createdAt: "2026-10-02T00:00:00.000Z" }],
      submittedAt: "2026-10-03T00:00:00.000Z",
      decision: decision("approved", "2026-10-05T00:00:00.000Z")
    })
    const shed = application({ id: "shed", projectTypeLabel: null, createdAt: "2026-10-04T00:00:00.000Z" })

    expect(recentActivity([fence, shed]).map((event) => [event.application.id, event.summary])).toEqual([
      ["fence", "Committee: approved"],
      ["shed", "Started"],
      ["fence", "Submitted to the committee"],
      ["fence", "Review: approve"],
      ["fence", "Started"]
    ])
    expect(recentActivity([fence, shed], 2)).toHaveLength(2)
    expect(recentActivity([])).toEqual([])
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
    expect(agoText("2026-10-09T11:30:00.000Z", asOf)).toBe("just now")
    expect(agoText("2026-10-09T10:00:00.000Z", asOf)).toBe("2 hours ago")
    expect(agoText("2026-10-08T23:00:00.000Z", asOf)).toBe("yesterday")
    expect(agoText("2026-10-03T10:00:00.000Z", asOf)).toBe("6 days ago")
  })
})
