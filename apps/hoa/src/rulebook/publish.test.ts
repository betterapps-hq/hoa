// @vitest-environment node
import { match } from "ts-pattern"
import { describe, expect, it } from "vitest"
import { builtRecords, builtRule } from "@/tests/builtDraft"
import { publishBlockers } from "./publish"

const proposed = { status: "proposed" as const, by: null, at: null, note: null }
const openIssue = { code: "undefined-term" as const, message: "gazebo isn't a term", related: [], resolution: null }

describe("publishBlockers", () => {
  it("asks for every record reviewed, approved records without open issues, every provision covered and a valid file", () => {
    expect(publishBlockers(builtRecords)).toEqual([])
    const blocked = {
      ...builtRecords,
      settings: { ...builtRecords.settings, review: proposed },
      rules: [
        { ...builtRule, review: proposed },
        { ...builtRule, issues: [openIssue] }
      ],
      provisions: builtRecords.provisions.map((provision) =>
        match(provision.key)
          .with("rules:2", () => ({
            ...provision,
            noRule: { reason: "heading" as const, note: null, review: proposed }
          }))
          .with("rules:3", () => ({ ...provision, noRule: null }))
          .otherwise(() => provision)
      )
    }
    expect(publishBlockers(blocked)).toEqual([
      "1 rule or term still needs review.",
      "The settings still need review.",
      "1 reason for having no rule still needs review.",
      "1 approved record has open issues.",
      "1 provision isn't covered by a rule or a reason."
    ])
    // Once everything is reviewed, the approved records must also make a valid rules file.
    const reviewed = {
      ...blocked,
      settings: builtRecords.settings,
      rules: [builtRule],
      provisions: builtRecords.provisions
    }
    const withoutReason = {
      ...reviewed,
      provisions: reviewed.provisions.map((provision) =>
        provision.key === "rules:3" ? { ...provision, noRule: null } : provision
      )
    }
    expect(publishBlockers(withoutReason)).toEqual([
      "1 provision isn't covered by a rule or a reason.",
      "The approved records would make a rules file with 1 problem, such as rules:3: no rule, term, setting or question cites it, and it has no reason for having no rule."
    ])
  })
})
