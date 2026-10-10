import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import type { PromptCache } from "@/ai/runPrompt"
import { uploadEdition } from "@/documents/documentStructure"
import { planUnits } from "@/encoding/plan"
import { problemRecords } from "@/encoding/steps/ruleRetry"
import type { StepAi } from "@/encoding/steps/run"
import type { Provision } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { replyingModel, scriptedModel, variablesPromptLoader } from "@/tests/scriptedModel"
import { buildDatasets } from "./datasets"
import { combineResults, evaluateDatasets, retryDataset } from "./evaluate"
import { goldenReferences } from "./golden"
import { oldConsolidation, oldDefinedTerms, oldRetry, retryItems } from "./oldRuns"
import { replayStage, written } from "./replay"
import { stepRunReport } from "./report"
import { readSavedRun, stepFileName } from "./savedRun"

// A build stage replayed from a saved run (evaluation.md, Running one step): with the content cache, it calls no model
// and gives back exactly the output the run saved, byte for byte as the runner writes it.

const folder = mkdtempSync(join(tmpdir(), "saved-run-"))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(folder, path)), { recursive: true })
  writeFileSync(join(folder, path), written(value))
}

const provision = (key: string, label: string, text: string, parentLabel: string | null = null): Provision => ({
  key,
  kind: "section",
  num: null,
  label,
  heading: null,
  parentLabel,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null
})

const provisions = [
  provision("rules:1", "1", "Owners must keep sidewalks clear."),
  provision("rules:2", "2", "Gates must be closed at night.")
]
const units = planUnits({ documents: [{ key: "rules", provisions }], references: new Map(), vocabulary: [] })
const document = {
  key: "rules",
  kind: "rules" as const,
  title: "Community Rules",
  issuedBy: null,
  governs: null,
  edition: uploadEdition({
    id: "u1",
    sha256: "a".repeat(64),
    pageCount: 1,
    effectiveDate: "2024-01-01",
    uploadedAt: "2024-01-02T00:00:00Z"
  })
}
const rule = {
  key: "rules:1#sidewalks",
  domain: "maintenance",
  title: "Sidewalks clear",
  statement: "An {{owner}} must keep sidewalks clear.",
  citations: [{ provisionKey: "rules:1", highlight: null, region: null }],
  requestTypes: ["violation"],
  appliesTo: "lot",
  kind: "norm",
  modality: "obligation",
  bearer: "owner",
  effectiveFrom: "2024-01-01",
  check: { type: "judgment", question: "Are the sidewalks clear?", evidence: [] }
}
const answer = {
  provisions: [
    { key: "rules:1", noRule: null },
    { key: "rules:2", noRule: { reason: "explanatory", note: "a sentence of background" } }
  ],
  rules: [rule]
}

write("steps/structure/rules.json", {
  documents: [{ key: "rules", provisions }],
  check: { outside: 0, problems: [], needsRepair: false },
  isRepaired: false,
  calls: []
})
write("steps/plan/result.json", units)
write("steps/vocabulary/rules.json", {
  terms: [
    {
      key: "sidewalk",
      kind: "thing",
      nature: "object",
      labels: [{ text: "sidewalk", role: "preferred" }],
      citations: [{ provisionKey: "rules:1", highlight: null, region: null }]
    }
  ],
  notes: [],
  calls: []
})
write("steps/merge/result.json", {
  rulebook: {
    organization: { id: "evaluation" },
    documents: [document],
    provisions,
    terms: [],
    proposedCore: [],
    rules: [],
    settings: { clauses: {} },
    questions: []
  },
  conflicts: [],
  coverage: { provisions: 2, uncovered: [] },
  termPairs: [],
  issues: []
})

function memoryCache(): PromptCache {
  const entries = new Map<string, unknown>()
  return { get: async (key) => entries.get(key), put: async (key, value) => void entries.set(key, value) }
}

const ai = (model: ReturnType<typeof replyingModel>, cache: PromptCache): StepAi => ({
  loadPrompt: variablesPromptLoader,
  createModel: () => model,
  modelId: "mock",
  environment: "test",
  sessionId: "replay",
  promptVersions: {},
  cache: () => cache
})

describe("replayStage", () => {
  it("gives back a cached stage's saved output byte for byte, and says when it differs", async () => {
    const cache = memoryCache()
    const [first] = await replayStage({
      stage: "encode",
      run: readSavedRun(folder),
      ai: ai(
        scriptedModel(() => answer),
        cache
      )
    })
    write(`steps/encode/${stepFileName(units[0]?.id ?? "")}.json`, { answer: first?.output, call: first?.call })

    const refusing = replyingModel(() => {
      throw new Error("a replay from the cache calls no model")
    })
    const [replayed] = await replayStage({ stage: "encode", run: readSavedRun(folder), ai: ai(refusing, cache) })
    expect(replayed?.reproduced).toBe(true)
    expect(replayed?.call.isCached).toBe(true)
    expect(written(replayed?.output)).toBe(written(readSavedRun(folder).encode.get(units[0]?.id ?? "")?.answer))

    const changed = await replayStage({
      stage: "encode",
      run: readSavedRun(folder),
      ai: ai(
        scriptedModel(() => ({ ...answer, notes: ["another answer"] })),
        memoryCache()
      )
    })
    expect(changed[0]?.reproduced).toBe(false)
  })

  it("replays the vocabulary and consolidation stages from what the run saved", async () => {
    const run = readSavedRun(folder)
    const vocabulary = await replayStage({
      stage: "vocabulary",
      run,
      ai: ai(
        scriptedModel(() => ({ terms: run.vocabulary[0]?.terms ?? [], notes: [] })),
        memoryCache()
      )
    })
    expect(vocabulary.map((item) => item.itemId)).toEqual(["rules"])
    const consolidated = await replayStage({
      stage: "consolidate",
      run,
      ai: ai(
        scriptedModel(() => ({ duplicates: [], overrides: [], conflicts: [] })),
        memoryCache()
      )
    })
    expect(consolidated[0]?.reproduced).toBe(false)
  })
})

describe("the old pipeline's outputs as the steps' equivalents", () => {
  it("maps a saved run's vocabulary, failing rules and consolidation, and says what's missing", () => {
    write("steps/verify/result.json", [
      {
        unitId: units[0]?.id,
        answer: { ...answer, rules: [{ ...rule, decidedBy: null }] },
        draft: null,
        problems: [
          {
            source: "zod",
            code: "custom",
            message: "a judgment check needs decidedBy",
            path: ["rules", 0, "decidedBy"],
            reference: null
          },
          { source: "validator", code: "coverage", message: "uncovered", path: ["provisions"], reference: null }
        ]
      }
    ])
    write(`steps/repair/${stepFileName(units[0]?.id ?? "")}~1.json`, {
      state: {
        unitId: units[0]?.id,
        answer: { ...answer, rules: [{ ...rule, decidedBy: "board", title: "Clear sidewalks" }] },
        draft: null,
        problems: []
      },
      call: {
        stage: "encoding-repair",
        itemId: "x",
        promptName: "p",
        promptVersion: 1,
        modelId: "m",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
        latencyMs: 1,
        isCached: false
      },
      notes: []
    })
    const run = readSavedRun(folder)
    expect(oldDefinedTerms(run, "rules")?.terms.map((term) => term.key)).toEqual(["sidewalk"])
    expect(oldDefinedTerms(run, "bylaws")).toBeNull()

    const records = problemRecords([...run.verified.values()])
    expect(records.map((record) => record.problems.map((problem) => problem.class))).toEqual([
      ["shape: a judgment check needs decidedBy"]
    ])
    const [item] = retryItems(run, new Map([["shape", 5]]), [])
    expect(item?.id).toBe(`rule-retry:${run.runId}:rules:1#sidewalks`)
    const outcome = item ? oldRetry(run, item) : null
    expect(outcome?.collateral).toEqual([])
    expect(outcome?.wordingChanged).toBe(true)
    expect(oldConsolidation(run, "dev")).toBeNull()
  })
})

describe("datasets against old runs", () => {
  it("scores every step's items, says which have no old result, and writes the summaries and reports", () => {
    const golden = sampleRulesFile()
    const references = goldenReferences(golden, [])
    const run = readSavedRun(folder)
    const datasets = {
      ...buildDatasets({ golden, references, splitOf: () => "dev" }),
      "rule-retry": retryDataset([{ label: "old", run }], new Map([["shape", 5]]), golden.rules)
    }
    const [results] = [combineResults([evaluateDatasets(datasets, [{ label: "old", run }], golden)], ["old"])]
    const finding = results?.find((result) => result.step === "rule-finding")
    expect(finding?.items.every((item) => item.results.old?.verdict === "missing")).toBe(true)
    expect(finding?.summary).toContain("## By slice")
    const vocabulary = results?.find((result) => result.step === "shared-vocabulary")
    expect(vocabulary?.items.every((item) => item.results.old?.verdict === "no-equivalent")).toBe(true)
    const retry = results?.find((result) => result.step === "rule-retry")
    expect(retry?.items.map((item) => item.results.old?.verdict)).toEqual(["correct"])
    expect(retry?.comparisons[0]?.text).toContain("## old: correct")

    const report = stepRunReport({
      runId: "r1",
      stage: "rule-retry",
      source: "a test",
      promptVersions: { "hoa-rule-structuring": 1 },
      wallSeconds: 2,
      calls: [
        {
          isCached: false,
          costUsd: 0.5,
          latencyMs: 2000,
          inputTokens: 100,
          cachedInputTokens: 80,
          cacheWriteTokens: 0,
          outputTokens: 10
        }
      ],
      problems: [{ code: "zod" }],
      items: retry?.items ?? [],
      runs: ["old"],
      extra: ["Key stability across repeats: 1.000 of items."]
    })
    expect(report).toContain("1 calls (0 from the content cache), $0.5000")
    expect(report).toContain("- zod: 1")
  }, 60_000)
})
