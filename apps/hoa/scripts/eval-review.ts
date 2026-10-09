import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { applicationReviewPrompts, pipelinePrompts } from "../src/ai/pipelinePrompts.ts"
import { resolvePromptVersions } from "../src/ai/promptLoader.ts"
import { runObjectPrompt, type PromptCache } from "../src/ai/runPrompt.ts"
import { recordScores } from "../src/ai/scores.ts"
import { applicationRequestType } from "../src/applications/application.ts"
import { reviewCase, type ReviewCase } from "../src/evaluation/review/cases.ts"
import { reviewJudgeAnswer, reviewJudgeVariables } from "../src/evaluation/review/judge.ts"
import { packetFixture, toPacket } from "../src/evaluation/review/packetFixture.ts"
import { costOf, reviewReport, type CaseReport } from "../src/evaluation/review/report.ts"
import { mergeRulesFiles } from "../src/evaluation/review/rulesFile.ts"
import { scoreReview } from "../src/evaluation/review/score.ts"
import type { StepRunner } from "../src/jobs/steps.ts"
import { rulebookVocabulary } from "../src/review/documentTypes.ts"
import { packetPageTexts } from "../src/review/packet.ts"
import { reviewApplication } from "../src/review/run.ts"
import { fenceRulesFile } from "../src/tests/fenceSchemaFixture.ts"
import { sampleRulesFile } from "../src/tests/sampleRulesFile.ts"
import { fixtures, readJson, writeJson } from "./evalFiles.ts"

// Evaluation round 2's runner (implementation-plan.md, E2.2): runs the review (`reviewApplication`, the code the
// ApplicationReview Workflow runs) in process on each case, with the real models, traced like the app (session id = run
// id), and scores it against the case's expected data. Writes each case's review, scores and steps, and a report, to
// .fixtures/eval/review/<run id>/. Model results are cached in .fixtures/eval/review/cache/, so a rerun pays only for
// what changed. Usage, from apps/hoa:
//   pnpm eval:review [--case fence-application,garage-baseline] [--sample 2]
// --sample N reads and writes model results in cache-sample-N/ instead, so the same configuration can be measured on
// fresh model answers (each sample is cached, so it reruns for free).
// Cases: the synthetic garage enclosure packets in samples/garage-enclosure/, and the fence packet's case in the
// git-ignored .fixtures/eval/review/fence-application/ (its packet comes from `pnpm ocr:fixture --packet`). The rules
// file is the committed sample Declaration plus the fence rules of src/tests/fenceSchemaFixture.ts, until the Design
// Guidelines' encoding is committed (implementation-log.md).
const { values } = parseArgs({ options: { case: { type: "string" }, sample: { type: "string" } } })

const reviewRuns = join(fixtures, "eval/review")
const modelRetries = 3
const casePaths = [
  ...readdirSync(join(import.meta.dirname, "../samples/garage-enclosure"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name, "case.json")),
  join(reviewRuns, "fence-application/case.json")
].filter((path) => existsSync(path))
const allCases = casePaths.map((path) => reviewCase.parse(readJson(path)))
const wanted = values.case?.split(",").filter(Boolean) ?? null
const cases = wanted ? allCases.filter((item) => wanted.includes(item.id)) : allCases
if (cases.length === 0) {
  throw new Error(`No cases match. Cases: ${allCases.map((item) => item.id).join(", ")}`)
}

const ai = createAiContext()
if (!ai.isConfigured) {
  throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
}
const rulesFile = mergeRulesFiles(sampleRulesFile(), fenceRulesFile())
const vocabulary = rulebookVocabulary(rulesFile)
const runId = `${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}${values.sample ? `-sample-${values.sample}` : ""}`
const out = join(reviewRuns, runId)
const fileName = (name: string) => name.replaceAll(":", "~").replaceAll("#", "~")

const cacheDir = values.sample ? `cache-sample-${values.sample}` : "cache"

function fileCache(traceName: string): PromptCache {
  const path = (key: string) => join(reviewRuns, cacheDir, traceName, `${key}.json`)
  return {
    get: async (key) => (existsSync(path(key)) ? readJson(path(key)) : undefined),
    put: async (key, value) => {
      writeJson(path(key), value)
    }
  }
}

function packetOf(item: ReviewCase) {
  if ("files" in item.packet) {
    return toPacket(item.packet, async () => {
      throw new Error("Synthetic packets have no images.")
    })
  }
  const dir = join(fixtures, "ocr", item.packet.fixture)
  return toPacket(
    packetFixture.parse(readJson(join(dir, "packet.json"))),
    async (path) => new Uint8Array(readFileSync(join(dir, path)))
  )
}

const promptVersions = await resolvePromptVersions(ai.loadPrompt, applicationReviewPrompts)
console.warn(`Run ${runId}: ${cases.map((item) => item.id).join(", ")}; prompts ${JSON.stringify(promptVersions)}`)
const reports: CaseReport[] = []
let judgeCost = 0
for (const item of cases) {
  const startedAt = performance.now()
  const packet = packetOf(item)
  const store: StepRunner = async (name, schema, run) => {
    const [stage = name, ...rest] = name.split(":")
    const stored = writeJson(
      join(out, item.id, "steps", stage, `${fileName(rest.join(":") || "result")}.json`),
      await run()
    )
    return schema.parse(JSON.parse(stored))
  }
  // Model steps retry like the Workflow's (modelStep: three retries); an answer that fails its check isn't cached.
  const step: StepRunner = async (name, schema, run, kind = "code") => {
    const attempts = kind === "model" ? modelRetries + 1 : 1
    for (let attempt = 1; attempt < attempts; attempt += 1) {
      try {
        return await store(name, schema, run)
      } catch (error) {
        console.warn(
          `  ${item.id} ${name}: attempt ${attempt} failed (${error instanceof Error ? error.message.replaceAll(/\s+/g, " ").slice(0, 600) : "error"})`
        )
      }
    }
    return store(name, schema, run)
  }
  const sessionId = `${runId}-${item.id}`
  const result = await reviewApplication({
    organizationId: rulesFile.organization.id,
    rulesFile,
    application: { requestType: applicationRequestType, ...item.application },
    packet,
    step,
    ai: {
      loadPrompt: ai.loadPrompt,
      createModel: ai.createModel,
      modelId: ai.modelId,
      smallModelId: ai.smallModelId,
      environment: ai.environment,
      sessionId,
      promptVersions,
      cache: fileCache
    },
    now: item.now,
    progress: async (stage, done, total) => {
      console.warn(`  ${item.id} ${stage} ${done}/${total}`)
    }
  })
  // The writer's judge: one call per review, cached like the review's own (its cost is the evaluation's, not the
  // review's).
  const judged = await runObjectPrompt({
    loadPrompt: ai.loadPrompt,
    createModel: ai.createModel,
    defaultModelId: ai.modelId,
    prompt: pipelinePrompts.reviewJudge,
    schema: reviewJudgeAnswer,
    variables: reviewJudgeVariables(result, rulesFile, vocabulary),
    traceName: "review-judge",
    environment: ai.environment,
    sessionId,
    cache: fileCache("review-judge")
  })
  judgeCost += judged.costUsd ?? 0
  writeJson(join(out, item.id, "judge.json"), judged.object)
  const score = scoreReview(result, item.expected, {
    vocabulary,
    pageText: packetPageTexts(packet),
    judged: judged.object
  })
  const durationSeconds = (performance.now() - startedAt) / 1000
  writeJson(join(out, item.id, "review.json"), result)
  writeJson(join(out, item.id, "scores.json"), score)
  await recordScores({
    traceName: "application-review",
    sessionId,
    input: { case: item.id, promptVersions },
    output: { recommendation: result.recommendation, failures: result.failures },
    scores: Object.entries(score.scores).flatMap(([name, value]) => (value === null ? [] : [{ name, value }])),
    recorder: ai.scores
  })
  await ai.flush()
  reports.push({
    id: item.id,
    title: item.title,
    score,
    recommendation: result.recommendation,
    calls: result.calls,
    failures: result.failures,
    durationSeconds
  })
  console.warn(`  ${item.id}: ${JSON.stringify(score.scores)}; $${costOf(result.calls).toFixed(4)}`)
}

const report = reviewReport(runId, promptVersions, reports)
writeJson(
  join(out, "summary.json"),
  reports.map(({ id, score, recommendation, calls }) => ({
    id,
    scores: score.scores,
    recommendation,
    costUsd: costOf(calls)
  }))
)
// The report holds rule keys, property keys and entity ids, never packet text.
writeFileSync(join(out, "report.md"), `${report}\n`)
console.warn(report)
console.warn(`Writer judge: $${judgeCost.toFixed(4)}`)
console.warn(`Written to ${out}`)
