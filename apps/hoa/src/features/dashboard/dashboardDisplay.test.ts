import { describe, expect, it } from "vitest"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { dashboardApplication as application, decision } from "./dashboard.test-data"
import {
  agoText,
  attentionItems,
  attentionLine,
  awaitingDecision,
  awaitingHomeowner,
  daysBetween,
  daysText,
  eventLine,
  homeownerAttentionLine,
  homeownerRulebookText,
  nextStepText,
  recommendationText,
  reviewStandingText,
  rulebookStandingText,
  standingDateText,
  standingText,
  waitedText,
  waitingOnHomeowner,
  waitingSince,
  yourApplicationsText
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

  it("asks for the review again once a newer rulebook changes the rules it applied", () => {
    const outdated = application({ status: "reviewed", reviews: reviewed("approve"), rulesChanged: true })
    expect(nextStepText(outdated)).toBe("The rules changed since your review. Run the review again, then submit it.")
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

  it("says where the homeowner's applications stand", () => {
    const applications = [
      application({ status: "draft" }),
      application({ status: "information-requested" }),
      application({ status: "reviewing" }),
      application({ status: "submitted" }),
      application({ status: "decided" }),
      application({ status: "decided" })
    ]
    expect(yourApplicationsText(applications)).toBe(
      "Of your 6 applications, 2 wait on you, 1 is being reviewed, 1 is with the committee and 2 are decided."
    )
    expect(yourApplicationsText([application({ status: "submitted" })])).toBe("Your application is with the committee.")
    expect(yourApplicationsText([])).toBe("You haven't started an application yet.")
  })

  it("says what waits on the homeowner in each of their applications, and the rules they must meet", () => {
    const asked = application({
      status: "information-requested",
      decision: decision("information-requested", "2026-10-07T09:00:00.000Z", "Send a paint chip.")
    })
    expect(homeownerAttentionLine(asked, asOf)).toEqual({
      subject: "Deck",
      aside: "Information requested",
      detail: "A deck behind the house.",
      note: "Send a paint chip. Asked 2 days ago."
    })
    const summary = {
      hoaName: "Sample Ridge HOA",
      publishedVersion: 3,
      publishedAt: "2026-10-07T12:00:00.000Z",
      ruleCount: 42,
      documentTitles: ["Declaration", "Design guidelines"]
    }
    expect(homeownerRulebookText(summary)).toBe("42 rules from 2 governing documents, in force since Oct 7.")
    expect(homeownerRulebookText({ ...summary, publishedVersion: null, publishedAt: null })).toBe(
      "The HOA hasn't published its rules yet."
    )
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

describe("attention", () => {
  it("lists what waits on the committee from every area, longest waiting first, saying what's needed", () => {
    const items = attentionItems({
      applications: [
        application({ id: "new", status: "submitted", submittedAt: "2026-10-08T00:00:00.000Z" }),
        application({
          id: "old",
          projectTypeLabel: "Fence",
          status: "submitted",
          submittedAt: "2026-09-20T00:00:00.000Z",
          reviews: reviewed("approve")
        }),
        application({ id: "asked", status: "information-requested" })
      ],
      nextRulebook: { status: "draft", createdAt: "2026-10-01T00:00:00.000Z", rulesToReview: 1, openQuestions: 2 },
      projectTypesToUpdate: 2,
      publishedAt: "2026-10-05T00:00:00.000Z"
    })

    expect(items.map((item) => [item.id, item.area])).toEqual([
      ["decision:old", "architectural-review"],
      ["rulebook-draft", "rulebook"],
      ["project-types", "architectural-review"],
      ["decision:new", "architectural-review"]
    ])
    expect(items.map(attentionLine)).toEqual([
      { subject: "Fence", detail: "A deck behind the house.", note: "Ready for your decision. Review: approve." },
      { subject: "Draft rulebook", detail: null, note: "1 rule and 2 questions to review before you publish it." },
      { subject: "Project types", detail: null, note: "2 are out of date with the rulebook in force." },
      { subject: "Deck", detail: "A deck behind the house.", note: "Ready for your decision. Not reviewed." }
    ])
  })

  it("leaves out what doesn't need the committee: a rulebook being built, project types up to date", () => {
    const quiet = { applications: [], projectTypesToUpdate: 0, publishedAt: "2026-10-05T00:00:00.000Z" }
    expect(attentionItems({ ...quiet, nextRulebook: { status: "building" } })).toEqual([])
    const [ready] = attentionItems({
      ...quiet,
      nextRulebook: { status: "draft", createdAt: asOf, rulesToReview: 0, openQuestions: 0 }
    })
    expect(attentionLine(ready!).note).toBe("Ready to publish.")
  })

  it("says how long something has waited", () => {
    expect(waitedText("2026-09-20T15:00:00.000Z", asOf)).toBe("Waiting 19 days")
    expect(waitedText("2026-10-09T08:00:00.000Z", asOf)).toBe("Since today")
  })
})

describe("eventLine", () => {
  const at = "2026-10-08T00:00:00.000Z"
  const fence = { id: "fence", projectTypeLabel: null, description: "A rear fence." }
  const jordan = "Jordan Avery"
  const sam = "Sam Rivera"

  it("names the application, says what happened to it and who did it", () => {
    expect(
      eventLine({ id: "1", at, by: jordan, type: "application-submitted", application: fence, again: false })
    ).toEqual({
      subject: "Something else",
      detail: "A rear fence.",
      note: "Submitted to the committee by Jordan Avery"
    })
    expect(
      eventLine({ id: "2", at, by: jordan, type: "application-submitted", application: fence, again: true }).note
    ).toBe("Submitted again by Jordan Avery")
    expect(
      eventLine({ id: "3", at, by: sam, type: "application-decided", application: fence, outcome: "approved-in-part" })
        .note
    ).toBe("Approved in part by Sam Rivera")
  })

  it("names the project type, the rulebook's version and the documents", () => {
    expect(
      eventLine({ id: "1", at, by: sam, type: "project-type-added", projectType: { id: "deck", label: "Deck" } })
    ).toEqual({ subject: "Deck", detail: null, note: "Added to the project types by Sam Rivera" })
    expect(eventLine({ id: "2", at, by: sam, type: "rulebook-published", version: 3 })).toEqual({
      subject: "Version 3",
      detail: null,
      note: "Published by Sam Rivera"
    })
    const declaration = { id: "declaration", title: "Declaration", version: 2 }
    expect(eventLine({ id: "3", at, by: sam, type: "documents-added", documents: [declaration] })).toEqual({
      subject: "Declaration",
      detail: null,
      note: "New version added by Sam Rivera"
    })
    const several = [
      { ...declaration, version: 1 },
      { id: "bylaws", title: "Bylaws", version: 1 },
      { id: "guidelines", title: "Guidelines", version: 1 }
    ]
    expect(eventLine({ id: "4", at, by: sam, type: "documents-added", documents: several })).toEqual({
      subject: "3 documents",
      detail: "Declaration, Bylaws and Guidelines",
      note: "Added to the governing documents by Sam Rivera"
    })
    expect(eventLine({ id: "5", at, by: sam, type: "documents-removed", documents: [declaration] }).note).toBe(
      "Removed from the governing documents by Sam Rivera"
    )
  })

  it("says what happened alone when the record doesn't say who did it", () => {
    expect(
      eventLine({ id: "1", at, by: null, type: "documents-removed", documents: [{ id: "a", title: "A", version: 1 }] })
        .note
    ).toBe("Removed from the governing documents")
  })
})

describe("area standing", () => {
  it("says where architectural review stands", () => {
    const submitted = application({ status: "submitted" })
    const asked = application({ status: "information-requested" })
    expect(reviewStandingText([submitted, submitted, asked])).toBe(
      "2 applications wait for a decision, and 1 waits on its homeowner."
    )
    expect(reviewStandingText([submitted])).toBe("1 application waits for a decision.")
    expect(reviewStandingText([asked, asked])).toBe("2 applications wait on their homeowners.")
    expect(reviewStandingText([application({ status: "decided" })])).toBe("No application is waiting.")
  })

  it("says where the rulebook stands and what's coming", () => {
    const published: DashboardSummary = {
      hoaName: "Sample Ridge HOA",
      publishedVersion: 3,
      publishedAt: "2026-10-07T12:00:00.000Z",
      ruleCount: 42,
      documentTitles: []
    }
    const none = { ...published, publishedVersion: null, publishedAt: null, ruleCount: 0 }
    expect(rulebookStandingText(published, null)).toBe("Version 3, with 42 rules, in force since Oct 7.")
    expect(rulebookStandingText(published, { status: "building" })).toBe(
      "Version 3, with 42 rules, in force since Oct 7. Your documents are being processed into a new draft."
    )
    expect(rulebookStandingText(none, null)).toBe(
      "No rulebook is in force yet. Process the governing documents to make one."
    )
    expect(rulebookStandingText(none, { status: "draft", createdAt: asOf, rulesToReview: 3, openQuestions: 0 })).toBe(
      "No rulebook is in force yet."
    )
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
