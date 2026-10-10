import { describe, expect, it } from "vitest"
import { jobOutputPrefix, jobStepKey } from "@/storage/keys"
import { buildResultsSince, type ResultsBucket } from "./buildResults"

const call = {
  stage: "provision-encoding",
  itemId: "u",
  promptName: "hoa-provision-encoding",
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
const rule = (key: string, title: string) => ({ key, title, citations: [{ provisionKey: key.split("#")[0] }] })
const state = (unitId: string, problems: number) => ({
  unitId,
  answer: {},
  draft: null,
  problems: Array.from({ length: problems }, () => ({
    source: "validator",
    code: "invariant",
    message: "x",
    path: [],
    reference: null
  }))
})

const outputs: [string, number, unknown][] = [
  ["structure:upload-1", 0, { documents: [] }],
  [
    "vocabulary:upload-1",
    1,
    { terms: [term("lot", "Lot"), term("owner", "Owner")], notes: [], isReused: false, calls: [] }
  ],
  ["encode:declaration:article-3", 5, { answer: { rules: [rule("declaration:3.1#no-pets", "No pets")] }, call }],
  ["verify:declaration:article-3", 5, state("declaration:article-3", 2)],
  ["repair:declaration:article-3:1", 8, { state: state("declaration:article-3", 0), call, notes: [] }],
  ["verify:merged", 9, [["declaration:article-3", []]]]
]

describe("buildResultsSince", () => {
  it("reads every page of outputs and turns each shown step into a result, oldest first", async () => {
    const page = await buildResultsSince(bucketOf(outputs), jobOutputPrefix("hoa", "job"), null)
    expect(page.results.map((result) => result.kind)).toEqual([
      "terms",
      "rules",
      "checked",
      "repaired",
      "checked-together"
    ])
    expect(page.results[0]).toMatchObject({ documentId: "upload-1", labels: ["Lot", "Owner"], isReused: false })
    expect(page.results[1]).toMatchObject({
      unitId: "declaration:article-3",
      rules: [{ key: "declaration:3.1#no-pets", title: "No pets", provisionKey: "declaration:3.1" }],
      isValid: false
    })
    expect(page.results[3]).toMatchObject({ unitId: "declaration:article-3", round: 1, problemsLeft: 0 })
    expect(page.cursor).toBe("2026-10-09T12:09:00.000Z")
  })

  it("returns only what was written at or after the cursor", async () => {
    const bucket = bucketOf(outputs)
    const page = await buildResultsSince(bucket, jobOutputPrefix("hoa", "job"), "2026-10-09T12:08:00.000Z")
    expect(page.results.map((result) => result.id)).toEqual(["repair:declaration:article-3:1", "verify:merged"])
    const empty = await buildResultsSince(bucketOf([]), jobOutputPrefix("hoa", "job"), "2026-10-09T12:08:00.000Z")
    expect(empty).toEqual({ results: [], cursor: "2026-10-09T12:08:00.000Z" })
  })

  it("skips an output it can't read instead of failing the page", async () => {
    const page = await buildResultsSince(
      bucketOf([["encode:declaration:article-1", 1, { not: "an encode output" }], ...outputs]),
      jobOutputPrefix("hoa", "job"),
      null
    )
    expect(page.results.some((result) => result.id === "encode:declaration:article-1")).toBe(false)
  })
})
