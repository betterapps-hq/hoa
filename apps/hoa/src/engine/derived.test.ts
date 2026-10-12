import { describe, expect, it } from "vitest"
import { storedTerm } from "@/schema/exampleRulebook.test-data"
import type { RulesFile } from "@/schema/types"
import { date, exampleContext, examples, fact } from "@/tests/engineContext"
import * as D from "./decimal"
import { resolvePath } from "./paths"
import * as V from "./values"

const request = { subject: { type: "entity" as const, id: "request" } }
const deemed = { from: "request" as const, path: ["violation.notice-deemed-delivered-on"] }

// A notice is given when mailed or delivered; given-on takes the mailing when there is one.
const withGivenOn: RulesFile = {
  ...examples,
  terms: [
    ...examples.terms,
    storedTerm({
      key: "violation.notice-given-on",
      organizationId: "org-sample",
      kind: "property",
      of: "violation",
      valueType: { type: "date" },
      ifUnstated: "unknown",
      derived: [
        {
          when: { type: "exists", from: "request", path: ["violation.notice-mailed-on"] },
          value: { type: "ref", from: "request", path: ["violation.notice-mailed-on"] },
          citations: []
        },
        {
          when: { type: "not", of: { type: "exists", from: "request", path: ["violation.notice-mailed-on"] } },
          value: { type: "ref", from: "request", path: ["violation.notice-delivered-on"] },
          citations: []
        }
      ],
      labels: [{ text: "notice given on", role: "preferred" }]
    }),
    storedTerm({
      key: "violation.circular-on",
      organizationId: "org-sample",
      kind: "property",
      of: "violation",
      valueType: { type: "date" },
      ifUnstated: "unknown",
      derived: [
        { when: null, value: { type: "ref", from: "request", path: ["violation.circular-on"] }, citations: [] }
      ],
      labels: [{ text: "circular", role: "preferred" }]
    })
  ]
}

const violation = (facts: ReturnType<typeof fact>[]) => exampleContext({ type: "violation", facts }, {}, withGivenOn)
const day = (value: string) => ({ type: "date", range: V.point(D.integer(Date.parse(value) / 86_400_000)) })

describe("derived properties", () => {
  it("deems notice delivered three days after mailing, and records that it was derived", () => {
    const context = violation([fact("request", "violation.notice-mailed-on", date("2026-03-02"))])
    expect(resolvePath(context, request, deemed)).toEqual({ state: "known", value: day("2026-03-05") })
    expect(context.reads).toEqual([
      { entity: "request", property: "violation.notice-deemed-delivered-on", state: "derived" },
      { entity: "request", property: "violation.notice-mailed-on", state: "known" }
    ])
  })

  it("is unknown, narrowed to a range, when its inputs are", () => {
    expect(resolvePath(violation([]), request, deemed)).toEqual({
      state: "unknown",
      isUnstated: true,
      partial: { type: "date", range: V.anyRange }
    })
  })

  it("takes the first derivation whose when holds", () => {
    const path = { from: "request" as const, path: ["violation.notice-given-on"] }
    const mailed = violation([
      fact("request", "violation.notice-mailed-on", date("2026-03-02")),
      fact("request", "violation.notice-delivered-on", date("2026-03-01"))
    ])
    expect(resolvePath(mailed, request, path)).toEqual({ state: "known", value: day("2026-03-02") })
    const delivered = violation([
      fact("request", "violation.notice-mailed-on", null, "absent"),
      fact("request", "violation.notice-delivered-on", date("2026-03-01"))
    ])
    expect(resolvePath(delivered, request, path)).toEqual({ state: "known", value: day("2026-03-01") })
    // Whether it was mailed isn't known, so neither derivation can be chosen.
    expect(resolvePath(violation([]), request, path)).toEqual({ state: "unknown", isUnstated: true, partial: null })
    const neither = violation([fact("request", "violation.notice-mailed-on", null, "absent")])
    expect(resolvePath(neither, request, path)).toEqual({
      state: "unknown",
      isUnstated: true,
      partial: { type: "date", range: V.anyRange }
    })
  })

  it("is unknown rather than endless when a derivation reads itself", () => {
    expect(resolvePath(violation([]), request, { from: "request", path: ["violation.circular-on"] })).toEqual({
      state: "unknown",
      isUnstated: true,
      partial: { type: "date", range: V.anyRange }
    })
  })
})
