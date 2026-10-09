import { describe, expect, it } from "vitest"
import type { NoRule, Provision } from "@/schema/types"
import { compareProvisions, coverageScores, provisionContent, splitMembership } from "./provisions"

const provision = (key: string, text: string, extra: Partial<Provision> = {}): Provision => ({
  key,
  kind: "section",
  num: null,
  label: key.slice(key.indexOf(":") + 1),
  heading: null,
  parentLabel: null,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null,
  ...extra
})

const noRule = (reason: NoRule["reason"]): NoRule => ({
  reason,
  note: null,
  review: { status: "proposed", by: null, at: null, note: null }
})

describe("provisionContent", () => {
  it("drops the number and keeps the heading once", () => {
    const section = provision("doc:4.3", "4.3 Fences. No chain link.", { heading: "Fences" })
    expect(provisionContent(section)).toBe("fences no chain link")
    expect(provisionContent({ ...section, text: "No chain link." })).toBe("fences no chain link")
  })
})

describe("compareProvisions", () => {
  it("matches keys and scores the matched text", () => {
    const golden = [provision("doc:1", "Owners keep lots tidy."), provision("doc:2", "No signs.")]
    const ours = [provision("doc:1", "Owners keep lots tidy"), provision("doc:3", "Pets.")]
    const result = compareProvisions(golden, ours)
    expect(result.keyMatch).toBe(0.5)
    expect(result.similarity).toBe(1)
    expect(result.missing).toEqual(["doc:2"])
    expect(result.extra).toEqual(["doc:3"])
  })
})

describe("coverageScores", () => {
  it("scores coverage and agreement with the golden's no-rule reasons", () => {
    const golden = [
      provision("doc:1", "a", { noRule: noRule("heading") }),
      provision("doc:2", "b", { noRule: noRule("explanatory") }),
      provision("doc:3", "c")
    ]
    const ours = [
      provision("doc:1", "a", { noRule: noRule("heading") }),
      provision("doc:2", "b"),
      provision("doc:3", "c")
    ]
    const result = coverageScores(golden, ours, { provisions: 4, uncovered: ["doc:3"] })
    expect(result.coverage).toBe(0.75)
    expect(result.reasonAgreement).toBe(0.5)
    expect(result.disagreements).toEqual([{ key: "doc:2", golden: "explanatory", pipeline: null }])
  })
})

describe("splitMembership", () => {
  const provisions = [
    provision("doc:article-1", "Article 1", { kind: "article" }),
    provision("doc:1.1", "1.1", { parentLabel: "article-1" }),
    provision("doc:1.1(a)", "(a)", { parentLabel: "1.1" }),
    provision("doc:article-2", "Article 2", { kind: "article" }),
    provision("doc:2.1", "2.1", { parentLabel: "article-2" }),
    provision("other:1", "1")
  ]

  it("places a provision by its topmost ancestor or its document", () => {
    const inSplit = splitMembership(provisions, ["doc:article-1", "other"])
    expect(["doc:1.1(a)", "doc:article-1", "doc:2.1", "other:1"].map(inSplit)).toEqual([true, true, false, true])
  })
})
