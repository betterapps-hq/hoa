import { describe, expect, it } from "vitest"
import type { z } from "zod"
import { outputSchema } from "@/ai/runPrompt"
import { termDraft, type TermContent } from "@/schema/zod"
import type { TermCandidate } from "../definedTerms"
import { consolidationAnswer, crossReferenceLines } from "./consolidation"
import {
  checkDefinedTerms,
  citableProvisions,
  definedTermsAnswer,
  definedTermsOf,
  definedTermsVariables,
  definingProvisions
} from "./definedTerms"
import { resolveOutlines, type Outline } from "./outline"
import { checkFinding, findingKeys, ruleFindingAnswer, subjectKey } from "./ruleFinding"
import { changedPaths, collateralChanges, outlineOfRecord, retryProblemsText } from "./ruleRetry"
import { clausesOf, draftsOf, ruleStructuringAnswer, structuringBatches } from "./ruleStructuring"
import { checkSharedVocabulary, sharedVocabularyAnswer } from "./vocabulary"
import { applyVocabularyMerge, mergeClusters, vocabularyMergeAnswer, vocabularyMergeVariables } from "./vocabularyMerge"

// The redesigned steps' code (prompt drafts v2): what each check finds, what code refuses, and the answer formats the
// model is sent. The steps' whole-dataset round trips are in src/evaluation/encoding/steps/stage.test.ts.

const outline = (key: string, overrides: Partial<Outline> = {}): Outline => ({
  key,
  provisionKey: key.slice(0, key.indexOf("#")),
  unitId: "rules:1",
  summary: "An owner must do it.",
  domain: "use",
  citations: [],
  interpretation: false,
  reads: [{ about: "shed", fact: "height" }],
  readKeys: [],
  kind: "norm",
  modality: "obligation",
  bearer: "owner",
  appliesTo: "lot",
  requestTypes: ["violation"],
  check: null,
  decidedBy: null,
  targets: null,
  except: null,
  sanction: null,
  resolved: null,
  selector: null,
  ...overrides
})

const term = (value: unknown): TermContent => termDraft.parse(value)
const property = (key: string, valueType: unknown, label: string) =>
  term({
    key,
    kind: "property",
    of: key.slice(0, key.lastIndexOf(".")),
    valueType,
    ifUnstated: "unknown",
    labels: [{ text: label, role: "preferred" }]
  })
const shed = term({
  key: "shed",
  kind: "thing",
  nature: "object",
  labels: [{ text: "storage shed", role: "preferred" }]
})

describe("answer formats", () => {
  it("are one fixed tool schema per step, with strict branches and shared definitions", () => {
    const schemas: z.ZodType[] = [
      definedTermsAnswer,
      ruleFindingAnswer(findingKeys([])),
      sharedVocabularyAnswer,
      vocabularyMergeAnswer,
      ruleStructuringAnswer,
      consolidationAnswer([])
    ]
    const sizes = schemas.map((schema) => JSON.stringify(outputSchema(schema, undefined, true).jsonSchema).length)
    expect(sizes.every((size) => size < 40_000)).toBe(true)
    expect(JSON.stringify(outputSchema(ruleStructuringAnswer, undefined, true).jsonSchema)).toContain(
      '"additionalProperties":false'
    )
  })

  it("refuse a field a kind can't have: a permission sent with a check", () => {
    const answer = {
      rules: [
        {
          kind: "permission",
          key: "rules:1#sheds",
          title: "Sheds",
          statement: "An owner may build a shed.",
          appliesWhen: null,
          beneficiary: null,
          noExceptions: null,
          overrides: [],
          check: { type: "approval", by: ["board"], needs: "any", prior: true, written: true }
        }
      ],
      clauses: {},
      proposedTerms: [],
      outlineIssues: [],
      unfixable: [],
      notes: []
    }
    expect(ruleStructuringAnswer.safeParse(answer).success).toBe(false)
  })
})

describe("B", () => {
  const candidates: TermCandidate[] = [
    { phrase: "Garden Fixtures", source: "definition", count: 2, definedIn: ["rules:9(1)", "rules:9/p2"], samples: [] },
    {
      phrase: "Rain Barrel",
      source: "usage",
      count: 3,
      definedIn: [],
      samples: [{ provisionKey: "rules:4", text: "A Rain Barrel is screened." }]
    }
  ]
  const labels = (text: string) => ({ preferred: { text, plural: null }, alternatives: [] })
  const answer = definedTermsAnswer.parse({
    things: [
      {
        key: "garden-fixture",
        nature: "object",
        ...labels("Garden Fixture"),
        definition: "a fixture listed in 9",
        citations: ["rules:9/p2", "rules:9(1)"]
      },
      { key: "rain-barrel", nature: "object", ...labels("Rain Barrel"), definition: null, citations: ["rules:4"] }
    ],
    categories: [],
    criteriaTerms: { properties: [], valueSets: [], units: [] },
    refinements: [{ key: "committee", ...labels("Garden Committee"), definition: null, citations: ["rules:1"] }],
    notes: []
  })

  it("may cite the definitions, the provisions candidates are defined in and a used candidate's samples", () => {
    expect(definingProvisions([{ key: "rules:1" }], candidates)).toEqual(["rules:1", "rules:9(1)", "rules:9/p2"])
    expect(citableProvisions([{ key: "rules:1" }], candidates)).toEqual([
      "rules:1",
      "rules:9(1)",
      "rules:9/p2",
      "rules:4"
    ])
  })

  it("checks drafted terms, which carry no organization, as the organization's, with every citable provision", () => {
    const terms = definedTermsOf(answer)
    expect(terms.every((term) => term.organizationId === null)).toBe(true)
    expect(checkDefinedTerms(terms, citableProvisions([{ key: "rules:1" }], candidates))).toEqual([])
    expect(
      checkDefinedTerms(terms, ["rules:1"])
        .filter((problem) => problem.recordKey === "rain-barrel")
        .map((p) => p.code)
    ).toEqual(["citation-not-given", "citation-not-found"])
  })

  it("shows each candidate's samples after their provision keys", () => {
    const variables = definedTermsVariables({
      document: { key: "rules", kind: "rules", title: "Rules", edition: null },
      definitions: [],
      candidates
    })
    expect(variables.candidates).toContain("  e.g. [rules:4] A Rain Barrel is screened.")
  })
})

describe("E", () => {
  it("resolves labels whole, never by a part of a longer label", () => {
    expect(subjectKey("storage sheds", [shed])).toBe("shed")
    expect(subjectKey("shed", [shed])).toBe("shed")
    expect(subjectKey("thing on the outside of a lot", [shed])).toBeNull()
  })

  it("checks coverage, keys, reasons, citations and targets", () => {
    const answer = ruleFindingAnswer(findingKeys([])).parse({
      provisions: [
        { key: "rules:1", outlines: [], settings: [], noRule: null },
        {
          key: "rules:2",
          outlines: [
            {
              aspect: "sheds",
              summary: "An owner may build a shed.",
              domain: "use",
              citations: ["rules:9"],
              reads: [],
              interpretation: false,
              kind: "permission",
              bearer: "owner",
              appliesTo: { label: "storage shed" },
              requestTypes: ["violation"],
              overrides: { rules: [], provisions: [], documents: [] }
            },
            {
              aspect: "sheds",
              summary: "Sheds must be small.",
              domain: "use",
              citations: [],
              reads: [],
              interpretation: false,
              kind: "obligation",
              bearer: "owner",
              appliesTo: "lot",
              requestTypes: ["violation"]
            }
          ],
          settings: [],
          noRule: { reason: "heading" }
        },
        { key: "rules:3", outlines: [], settings: [], noRule: { reason: "heading" } }
      ],
      questions: [],
      referencedDocuments: [],
      notes: []
    })
    const problems = checkFinding({
      answer,
      unitProvisions: ["rules:1", "rules:2"],
      provisions: [{ key: "rules:1" }, { key: "rules:2" }],
      outlines: []
    })
    expect(problems.map((problem) => `${problem.provisionKey} ${problem.code}`).toSorted()).toEqual([
      "rules:1 uncovered",
      "rules:2 citation-not-found",
      "rules:2 duplicate-key",
      "rules:2 no-reads",
      "rules:2 no-targets",
      "rules:2 reason-with-rules",
      "rules:3 other-provision"
    ])
  })

  it("resolves targets by key and by provision, keeps a sanction's enforceable ones, and lists the rest", () => {
    const sanction = outline("rules:5#fine", {
      kind: "sanction",
      modality: "permission",
      bearer: null,
      appliesTo: "violation",
      targets: { rules: ["rules:1#limit", "rules:2#gone"], provisions: ["rules:3"], documents: [] },
      except: { rules: [], provisions: [], documents: [] },
      sanction: { type: "fine", imposedBy: "board", against: ["owner"] }
    })
    const resolved = resolveOutlines(
      [outline("rules:1#limit"), outline("rules:3#meeting", { requestTypes: ["meeting"] }), sanction],
      [
        { key: "rules:1", parentLabel: null },
        { key: "rules:3", parentLabel: null }
      ]
    )
    expect(resolved.outlines.find((item) => item.key === "rules:5#fine")?.resolved?.rules).toEqual(["rules:1#limit"])
    expect(resolved.unresolved).toEqual([{ key: "rules:5#fine", target: "rules:2#gone" }])
  })
})

describe("C", () => {
  it("reports outlines no term serves, outlines that aren't the group's, and a key with two value types, not drafts' missing organization", () => {
    const problems = checkSharedVocabulary(
      [
        {
          groupId: "g1",
          terms: [
            shed,
            property("shed.height", { type: "quantity", unit: "foot" }, "height"),
            property("shed.height", { type: "boolean" }, "height")
          ],
          serves: new Map([["shed.height", ["rules:1#height", "rules:9#other"]]]),
          outlines: [outline("rules:1#height"), outline("rules:2#color")],
          unknown: ["gazebo"]
        }
      ],
      []
    )
    expect(new Set((problems.get("g1") ?? []).map((problem) => problem.code))).toEqual(
      new Set(["conflict", "undefined-term", "unknown-outline", "unserved-outline"])
    )
  })
})

describe("C-merge", () => {
  const entries = [
    { term: shed, serves: [], origin: "defined" as const },
    {
      term: property("shed.height", { type: "quantity", unit: "foot" }, "height"),
      serves: ["a", "b"],
      origin: "group 1" as const
    },
    {
      term: property("shed.tall", { type: "quantity", unit: "inch" }, "height"),
      serves: ["c"],
      origin: "group 2" as const
    },
    { term: property("shed.height", { type: "boolean" }, "height"), serves: [], origin: "group 3" as const }
  ]

  it("clusters near-duplicates and collisions, applies merges and renames, and refuses what can't be", () => {
    const clusters = mergeClusters(entries)
    const { variables, ids } = vocabularyMergeVariables(entries, clusters)
    expect(variables.clusters.split("\n")).toHaveLength(3)
    const id = (origin: string) => [...ids].find(([, index]) => entries[index]?.origin === origin)?.[0] ?? ""
    const applied = applyVocabularyMerge({
      entries,
      ids,
      answer: {
        merges: [
          { keep: id("group 1"), merge: [id("group 2")], why: "one length" },
          { keep: id("group 1"), merge: [id("group 3")], why: "wrong" },
          { keep: "t99", merge: [id("group 2")], why: "no such line" }
        ],
        renames: [{ id: id("group 3"), name: "has-height", why: "another value type" }],
        distinct: [],
        notes: []
      }
    })
    expect(applied.merges).toEqual([{ keep: "shed.height", merge: ["shed.tall"] }])
    expect(applied.renames).toEqual([{ key: "shed.height", origin: "group 3", to: "shed.has-height" }])
    expect(applied.problems.map((problem) => problem.code)).toEqual(["invalid-merge", "invalid-merge"])
    expect(applied.terms.map((item) => item.key)).toEqual(["shed", "shed.has-height", "shed.height"])
    expect(applied.serves.get("shed.height")).toEqual(["a", "b", "c"])
  })
})

describe("F and its retry", () => {
  it("batches outlines by count, keeping a provision's together", () => {
    const outlines = Array.from({ length: 25 }, (_value, index) => outline(`rules:${Math.floor(index / 5)}#r${index}`))
    expect(structuringBatches(outlines, 15, 20).map((batch) => batch.length)).toEqual([15, 10])
  })

  it("finds keys, kinds and targets the outlines don't allow, and wraps clause citations", () => {
    const { problems } = draftsOf({
      outlines: [
        outline("rules:1#limit"),
        outline("rules:2#exception", {
          modality: "permission",
          resolved: { rules: ["rules:1#limit"], documents: [], except: [] }
        })
      ],
      rules: [
        {
          kind: "recommendation",
          key: "rules:1#limit",
          title: "Limit",
          statement: "Should.",
          appliesWhen: null,
          beneficiary: null,
          noExceptions: null,
          overrides: [],
          check: { type: "test", test: { type: "text", text: "small" } },
          remedy: null,
          cure: null,
          recurs: null
        },
        {
          kind: "permission",
          key: "rules:2#exception",
          title: "Exception",
          statement: "May.",
          appliesWhen: null,
          beneficiary: null,
          noExceptions: "rules:2",
          overrides: ["rules:7#other"]
        },
        {
          kind: "permission",
          key: "rules:9#stray",
          title: "Stray",
          statement: "May.",
          appliesWhen: null,
          beneficiary: null,
          noExceptions: null,
          overrides: []
        }
      ],
      effectiveFrom: () => "2024-01-01"
    })
    expect(problems.map((problem) => `${problem.key} ${problem.code}`)).toEqual([
      "rules:9#stray unknown-rule",
      "rules:1#limit kind-changed",
      "rules:2#exception outside-outline"
    ])
    const clauses = clausesOf(
      ruleStructuringAnswer.parse({
        rules: [],
        clauses: {
          deciders: [{ requestType: "violation", party: "board", citations: ["rules:4"] }]
        },
        proposedTerms: [],
        outlineIssues: [],
        unfixable: [],
        notes: []
      })
    )
    expect(clauses.deciders?.[0]?.citations).toEqual([{ provisionKey: "rules:4", highlight: null, region: null }])
  })

  it("shows a failing rule in F's format with its problems, and counts collateral changes", () => {
    const record = {
      key: "rules:1#limit",
      kind: "norm",
      modality: "obligation",
      title: "Limit",
      statement: "Must.",
      citations: [{ provisionKey: "rules:1" }],
      check: { type: "test", test: { type: "text", text: "small" } },
      requestTypes: ["violation"]
    }
    const item = {
      unitId: "rules:1",
      key: "rules:1#limit",
      record,
      problems: [
        { code: "undefined-term", class: "undefined-term", message: "x isn't a term", path: ["check", "test"] }
      ]
    }
    expect(outlineOfRecord(item).modality).toBe("obligation")
    expect(retryProblemsText([item])).toContain("rules:1#limit: check.test: x isn't a term [undefined-term]")
    const after = {
      ...record,
      title: "Size limit",
      check: { type: "test", test: { type: "text", text: "tiny" } },
      bearer: "board"
    }
    expect(changedPaths(record, after)).toEqual([["bearer"], ["check", "test", "text"], ["title"]])
    expect(collateralChanges(record, after, [["check", "test"]])).toMatchObject({
      collateral: [["bearer"]],
      wordingChanged: true
    })
  })
})

describe("consolidation", () => {
  it("lists rules referring to another section's rules, and targets that resolved to nothing", () => {
    const rule = (key: string) => ({
      key,
      domain: "use" as const,
      title: "T",
      statement: "S.",
      citations: [{ provisionKey: key.slice(0, key.indexOf("#")), highlight: null, region: null }],
      requestTypes: ["violation"],
      appliesTo: "lot",
      appliesWhen: null,
      scope: null,
      authority: null,
      effectiveFrom: "2024-01-01",
      kind: "discretion" as const,
      decidedBy: "board",
      overrides: []
    })
    const lines = crossReferenceLines({
      rules: [rule("rules:1#a"), rule("rules:5#b")],
      references: new Map([["rules:1", ["rules:5"]]]),
      sectionOf: (key) => key,
      unresolved: [{ key: "rules:1#a", target: "rules:9" }]
    })
    expect(lines).toEqual(["rules:1#a | rules:5 | rules:5#b", "rules:1#a | rules:9 | nothing resolved"])
  })
})
