import { describe, expect, it } from "vitest"
import { jobOutputPrefix, jobStepKey } from "@/storage/keys"
import { buildResultsSince, type ResultsBucket } from "./buildResults"

const call = {
  stage: "rule-structuring",
  itemId: "u",
  promptName: "hoa-rule-structuring",
  promptVersion: 1,
  modelId: "m",
  inputTokens: 1,
  cachedInputTokens: null,
  cacheWriteTokens: null,
  outputTokens: 1,
  costUsd: 0,
  latencyMs: 1,
  isCached: false
}

/** An in-memory bucket of step outputs, each written at its minute. */
function bucketOf(outputs: [name: string, minute: number, value: unknown][], pageSize = 2): ResultsBucket {
  const objects = outputs.map(([name, minute, value]) => ({
    key: jobStepKey("hoa", "job", name),
    uploaded: new Date(Date.UTC(2026, 9, 9, 12, minute)),
    value
  }))
  return {
    list: async ({ prefix, cursor }) => {
      const matching = objects
        .filter((object) => object.key.startsWith(prefix))
        .toSorted((a, b) => a.key.localeCompare(b.key))
      const start = cursor === undefined ? 0 : Number(cursor)
      const page = matching.slice(start, start + pageSize)
      const isTruncated = start + pageSize < matching.length
      return {
        objects: page.map(({ key, uploaded }) => ({ key, uploaded })),
        truncated: isTruncated,
        ...(isTruncated ? { cursor: String(start + pageSize) } : {})
      }
    },
    get: async (key) => {
      const found = objects.find((object) => object.key === key)
      return found ? { text: async () => JSON.stringify(found.value) } : null
    }
  }
}

const term = (key: string, label: string) => ({
  key,
  kind: "thing",
  nature: "object",
  labels: [{ text: label, role: "preferred" }],
  citations: []
})
const finding = (provisionKey: string, aspect: string, summary: string) => ({
  answer: {
    provisions: [
      { key: "declaration:article-3", outlines: [], settings: [], noRule: { reason: "heading" } },
      { key: provisionKey, outlines: [{ aspect, summary, kind: "prohibition" }], settings: [], noRule: null },
      {
        key: "declaration:3.9",
        outlines: [],
        settings: [{ clause: "liability", summary: "Owners answer for their guests" }],
        noRule: null
      }
    ],
    questions: [],
    referencedDocuments: [],
    notes: []
  },
  problems: [],
  call
})
const structured = (key: string, title: string, statement?: string) => ({
  rules: [
    {
      key,
      draft: { key, title, statement, citations: [{ provisionKey: key.split("#")[0] }] },
      rule: null,
      issues: []
    }
  ],
  proposedTerms: [],
  clauses: {},
  notes: [],
  problems: [],
  calls: [call]
})
const problem = { code: "invariant", message: "x", path: [] }

const outputs: [string, number, unknown][] = [
  ["structure:upload-1", 0, { documents: [] }],
  [
    "defined-terms:declaration",
    1,
    { terms: [term("lot", "Lot"), term("owner", "Owner")], problems: [], found: 0, calls: [] }
  ],
  ["find-rules:declaration:article-3", 3, finding("declaration:3.1", "no-pets", "No pets on a lot")],
  ["find-rules:check", 4, [["declaration:article-3", []]]],
  ["find-rules:resolve", 4, { outlines: [] }],
  [
    "structure-rules:declaration:3.1#no-pets",
    6,
    structured("declaration:3.1#no-pets", "No pets", "No {{pet:plural}} may be kept on a {{lot}}.")
  ],
  [
    "structure-rules:check:1",
    7,
    [{ batchId: "declaration:3.1#no-pets", rules: [{ key: "declaration:3.1#no-pets", problems: [problem] }] }]
  ],
  ["structure-rules:declaration:3.1#no-pets:retry-1", 8, structured("declaration:3.1#no-pets", "No pets")],
  ["merge", 9, { not: "a merge output" }]
]

describe("buildResultsSince", () => {
  it("reads every page of outputs and turns each shown step into a result, oldest first", async () => {
    const page = await buildResultsSince(bucketOf(outputs), jobOutputPrefix("hoa", "job"), null)
    expect(page.results.map((result) => result.kind)).toEqual([
      "terms",
      "outlines",
      "checked-together",
      "rules",
      "rules-checked",
      "rules"
    ])
    expect(page.results[0]).toMatchObject({ documentKey: "declaration", labels: ["Lot", "Owner"] })
    expect(page.results[1]).toMatchObject({
      unitId: "declaration:article-3",
      rules: [{ key: "declaration:3.1#no-pets", title: "No pets on a lot", provisionKey: "declaration:3.1" }],
      isRerun: false
    })
    // Every provision E answered, with the settings it flags and its reason for no rule, for the build's picture.
    expect(page.results[1]).toMatchObject({
      provisions: [
        { key: "declaration:article-3", settings: [], noRule: "heading" },
        { key: "declaration:3.1", settings: [], noRule: null },
        { key: "declaration:3.9", settings: ["Owners answer for their guests"], noRule: null }
      ]
    })
    expect(page.results[2]).toMatchObject({ unitsWithProblems: 0, problems: 0 })
    expect(page.results[3]).toMatchObject({
      batchId: "declaration:3.1#no-pets",
      rules: [
        {
          key: "declaration:3.1#no-pets",
          title: "No pets",
          provisionKey: "declaration:3.1",
          statement: "No {{pet:plural}} may be kept on a {{lot}}."
        }
      ],
      round: 0
    })
    // A draft without a statement shows none.
    expect(page.results[5]).toMatchObject({ rules: [expect.not.objectContaining({ statement: expect.anything() })] })
    expect(page.results[4]).toMatchObject({ round: 1, rulesWithProblems: 1 })
    expect(page.results[5]).toMatchObject({ batchId: "declaration:3.1#no-pets", round: 1 })
    expect(page.cursor).toBe("2026-10-09T12:09:00.000Z")
  })

  it("returns only what was written at or after the cursor", async () => {
    const bucket = bucketOf(outputs)
    const page = await buildResultsSince(bucket, jobOutputPrefix("hoa", "job"), "2026-10-09T12:07:00.000Z")
    expect(page.results.map((result) => result.id)).toEqual([
      "structure-rules:check:1",
      "structure-rules:declaration:3.1#no-pets:retry-1"
    ])
    const empty = await buildResultsSince(bucketOf([]), jobOutputPrefix("hoa", "job"), "2026-10-09T12:08:00.000Z")
    expect(empty).toEqual({ results: [], cursor: "2026-10-09T12:08:00.000Z" })
  })

  it("reads a section's second look as a rerun, and skips an output it can't read instead of failing the page", async () => {
    const page = await buildResultsSince(
      bucketOf([
        ["find-rules:declaration:article-1", 1, { not: "a finding" }],
        ["find-rules:declaration:article-3:rerun", 2, finding("declaration:3.2", "no-signs", "No signs")],
        ...outputs
      ]),
      jobOutputPrefix("hoa", "job"),
      null
    )
    expect(page.results.some((result) => result.id === "find-rules:declaration:article-1")).toBe(false)
    expect(page.results.find((result) => result.id === "find-rules:declaration:article-3:rerun")).toMatchObject({
      kind: "outlines",
      unitId: "declaration:article-3",
      isRerun: true
    })
  })
})
