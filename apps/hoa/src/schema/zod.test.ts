import { describe, expect, it } from "vitest"
import * as ex from "./examples.test-data"
import { type EncodingDraft, encodingDraft, questionDraft, rule, ruleDraft, termDraft } from "./zod"

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? []

describe("ruleDraft", () => {
  it("fills every field a draft may leave out", () => {
    const parsed = ruleDraft.parse({
      key: "rules:3.2#no-boats",
      kind: "norm",
      domain: "use",
      title: "No boats",
      statement: "No boats.",
      citations: [{ provisionKey: "rules:3.2", highlight: null, region: null }],
      requestTypes: ["violation"],
      appliesTo: "vehicle",
      effectiveFrom: "2025-11-12",
      modality: "prohibition",
      bearer: "owner"
    })
    expect(parsed).toMatchObject({
      appliesWhen: null,
      scope: null,
      authority: null,
      beneficiary: null,
      decidedBy: null,
      overrides: [],
      noExceptions: null,
      check: null,
      remedy: null,
      recurs: null,
      cure: null
    })
  })

  it("fills a sanction's defaults", () => {
    const { against: _, sanction, ...draft } = ex.lateFee
    const parsed = ruleDraft.parse({ ...draft, sanction: { type: sanction.type, amounts: "none" } })
    expect(parsed).toMatchObject({
      against: ["owner"],
      sanction: { after: null, occurrences: null, repeats: null, cap: null, suspends: [], lasts: null }
    })
  })

  it.each([
    [{ ...ex.maxHeight, check: null }, "an obligation needs a check"],
    [{ ...ex.noSolar, check: ex.maxHeight.check }, "a prohibition never has a check"],
    [{ ...ex.maxHeight, bearer: null }, "a requirement has no bearer, and every other norm has one"],
    [{ ...ex.quorum, bearer: "owner" }, "a requirement has no bearer, and every other norm has one"],
    [{ ...ex.quorum, remedy: "redesign" }, "a requirement has no remedy or cure"],
    [{ ...ex.sightLines, decidedBy: null }, "a judgment check needs decidedBy"],
    [{ ...ex.maintainLandscaping, remedy: "none" }, "remedy none can't have a cure period"],
    [{ ...ex.maxHeight, appliesTo: null }, "appliesTo is null only with an overrides selector"],
    [{ ...ex.metalVariations, overrides: [] }, "a discretion rule overrides at least one rule"],
    [{ ...ex.lateFee, enforces: { rules: [], documents: [] } }, "a sanction enforces at least one rule or document"],
    [{ ...ex.lateFee, appliesTo: "violation" }, "a sanction's appliesTo is one of its request types"]
  ])("rejects a rule that breaks an invariant: %#", (draft, message) => {
    expect(messages(ruleDraft.safeParse(draft))).toEqual([message])
  })

  it("allows appliesTo null with an overrides selector", () => {
    expect(ruleDraft.safeParse({ ...ex.grandfathered, appliesTo: null }).error).toBeUndefined()
  })
})

describe("rule", () => {
  const bookkeeping = {
    provenance: { by: "extraction", at: "2026-10-09T12:00:00Z" },
    review: { status: "approved", by: "user-1", at: "2026-10-09T12:00:00Z", note: null },
    issues: []
  }

  it("needs a citation once approved", () => {
    const stored = { ...ruleDraft.parse(ex.maxHeight), ...bookkeeping }
    expect(rule.safeParse(stored).error).toBeUndefined()
    expect(messages(rule.safeParse({ ...stored, citations: [] }))).toEqual([
      "an approved rule has at least one citation"
    ])
  })
})

describe("termDraft", () => {
  it("fills a term's defaults", () => {
    const parsed = termDraft.parse({
      key: "fence-run.posts",
      kind: "property",
      of: "fence-run",
      valueType: { type: "count" },
      ifUnstated: "unknown",
      labels: [{ text: "posts", role: "preferred" }]
    })
    expect(parsed).toMatchObject({
      organizationId: null,
      definition: null,
      scopeNote: null,
      context: null,
      citations: [],
      many: false,
      derived: null,
      labels: [{ text: "posts", role: "preferred", plural: null, citation: null }]
    })
  })

  it("needs exactly one preferred label", () => {
    const labels = [
      { text: "gate", role: "preferred" },
      { text: "door", role: "preferred" }
    ]
    expect(messages(termDraft.safeParse({ key: "gate", kind: "thing", nature: "object", labels }))).toEqual([
      "a term has exactly one preferred label"
    ])
  })

  it("gives a thing request data exactly when its nature is request", () => {
    const labels = [{ text: "dispute", role: "preferred" }]
    const draft = { key: "dispute", kind: "thing", labels }
    expect(messages(termDraft.safeParse({ ...draft, nature: "request" }))).toEqual([
      "a thing has request data exactly when its nature is request"
    ])
    const request = { flow: "filing", governingDate: null, lot: "none" }
    expect(messages(termDraft.safeParse({ ...draft, nature: "object", request }))).toEqual([
      "a thing has request data exactly when its nature is request"
    ])
    expect(termDraft.safeParse({ ...draft, nature: "request", request }).error).toBeUndefined()
  })
})

describe("questionDraft", () => {
  it("fills the answer and empty lists", () => {
    const parsed = questionDraft.parse({
      kind: "conflict",
      question: "Which height applies?",
      options: [{ label: "72 inches", keeps: [] }],
      about: {}
    })
    expect(parsed).toEqual({
      kind: "conflict",
      question: "Which height applies?",
      citations: [],
      about: { rules: [], terms: [] },
      options: [{ label: "72 inches", keeps: [] }],
      answer: null
    })
  })
})

describe("encodingDraft", () => {
  it("parses a unit's answer, filling what it leaves out", () => {
    const draft: EncodingDraft = {
      provisions: [{ key: "guidelines:5.4.2(i)" }, { key: "guidelines:5.4", noRule: { reason: "heading" } }],
      terms: ex.organizationTerms.slice(0, 1),
      rules: [ex.compositeColors],
      questions: [ex.interpretation],
      clauses: { deciders: [{ requestType: "architectural-application", party: "committee", citations: [] }] }
    }
    const parsed = encodingDraft.parse(draft)
    expect(parsed.provisions).toEqual([
      { key: "guidelines:5.4.2(i)", noRule: null },
      { key: "guidelines:5.4", noRule: { reason: "heading", note: null } }
    ])
    expect(parsed.rules[0]).toMatchObject({ key: "guidelines:5.4.2(i)#colors", scope: null })
    expect(parsed.referencedDocuments).toEqual([])
    expect(parsed.notes).toEqual([])
  })

  it("rejects an invalid rule draft inside it", () => {
    const result = encodingDraft.safeParse({ provisions: [], rules: [{ ...ex.maxHeight, check: null }] })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["rules", 0, "check"]])
  })
})
