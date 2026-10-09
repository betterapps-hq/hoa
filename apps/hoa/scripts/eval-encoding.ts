import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { rulebookBuildPrompts } from "../src/ai/pipelinePrompts.ts"
import { resolvePromptVersions } from "../src/ai/promptLoader.ts"
import type { PromptCache } from "../src/ai/runPrompt.ts"
import { recordScores } from "../src/ai/scores.ts"
import { uploadEdition } from "../src/documents/documentStructure.ts"
import { buildRulebook, type StepRunner } from "../src/encoding/build.ts"
import { buildScores } from "../src/encoding/buildScores.ts"
import { selectsUnit } from "../src/encoding/unitSelection.ts"
import { pageSchema } from "../src/ocr/page.ts"
import { sampleDocuments } from "./sampleDocuments.ts"

// Evaluation round 1's runner (implementation-plan.md, E1.2): runs the rulebook build in process, without a Workflow,
// on the cached page records in .fixtures/ocr/ (git-ignored: they name individuals, so nothing here prints their text),
// with the real models, traced to Langfuse as the app traces a build (session id = run id). Writes the merged draft,
// every step's output (the per-unit drafts are under steps/encode and steps/repair), the issues and a short report to
// .fixtures/eval/encoding/<run id>/. Scoring against the golden encoding is E1.3. Usage, from apps/hoa:
//   pnpm eval:encoding [--split dev|test|all] [--documents declaration,design-guidelines] [--units <key>,<key>]
// The split is by provision key: dev is the Declaration's Articles 1 to 8 and the use restrictions (Exhibit C), test
// its Articles 9 to 21. --units keeps only units holding or under the given provision keys or in the given documents.
const { values } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    documents: { type: "string", default: "declaration" },
    units: { type: "string" }
  }
})

const articles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `declaration:article-${from + index}`)
const splits: Record<string, string[] | null> = {
  dev: [...articles(1, 8), "use-restrictions"],
  test: articles(9, 21),
  all: null
}
const split = splits[values.split]
if (split === undefined) {
  throw new Error(`--split is dev, test or all, not ${values.split}`)
}
const unitSelectors = values.units?.split(",").filter(Boolean) ?? null
const documents = values.documents.split(",").map((fixture) => {
  const found = sampleDocuments.find((document) => document.fixture === fixture)
  if (!found) {
    throw new Error(
      `Unknown document ${fixture}: use ${sampleDocuments.map((document) => document.fixture).join(", ")}`
    )
  }
  return found
})

const ai = createAiContext()
if (!ai.isConfigured) {
  throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
}
const fixtures = join(import.meta.dirname, "../../../.fixtures")
const runId = `${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}-${values.split}`
const out = join(fixtures, "eval/encoding", runId)
const fileName = (name: string) => name.replaceAll(":", "~")
/** Writes a value as JSON and returns the text written. */
const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  const text = `${JSON.stringify(value, null, 1)}\n`
  writeFileSync(path, text)
  return text
}

/** Model results by content, shared by runs, so a rerun pays only for what changed. */
function fileCache(stage: string): PromptCache {
  const path = (key: string) => join(fixtures, "eval/encoding/cache", stage, `${key}.json`)
  return {
    get: async (key) => (existsSync(path(key)) ? JSON.parse(readFileSync(path(key), "utf8")) : undefined),
    put: async (key, value) => {
      writeJson(path(key), value)
    }
  }
}

/** Runs a step in process, keeping its output as the Workflow would, and checking it round-trips the same way. */
const step: StepRunner = async (name, schema, run) => {
  const [stage = name, ...item] = name.split(":")
  const stored = writeJson(join(out, "steps", stage, `${fileName(item.join(":") || "result")}.json`), await run())
  return schema.parse(JSON.parse(stored))
}

const startedAt = performance.now()
const promptVersions = await resolvePromptVersions(ai.loadPrompt, rulebookBuildPrompts)
console.warn(
  `Run ${runId}: ${documents.map((document) => document.fixture).join(", ")}; prompts ${JSON.stringify(promptVersions)}`
)
const result = await buildRulebook({
  organizationId: "evaluation",
  sources: documents.map((document) => {
    const text = readFileSync(join(fixtures, "ocr", document.fixture, "pages.json"), "utf8")
    const pages = pageSchema.array().parse(JSON.parse(text))
    return {
      documentId: document.fixture,
      title: document.title,
      structure: document.structure,
      edition: uploadEdition({
        id: document.fixture,
        sha256: createHash("sha256").update(text).digest("hex"),
        pageCount: pages.length,
        effectiveDate: document.effectiveDate,
        uploadedAt: document.effectiveDate
      }),
      loadPages: async () => pages
    }
  }),
  step,
  ai: {
    loadPrompt: ai.loadPrompt,
    createModel: ai.createModel,
    modelId: ai.modelId,
    environment: ai.environment,
    sessionId: runId,
    promptVersions,
    cache: fileCache
  },
  previous: null,
  now: new Date().toISOString(),
  progress: async (stage, done, total) => {
    console.warn(`  ${stage} ${done}/${total}`)
  },
  selectUnits: (unit) =>
    (split === null || selectsUnit(split)(unit)) && (unitSelectors === null || selectsUnit(unitSelectors)(unit))
})
const durationSeconds = (performance.now() - startedAt) / 1000
const scores = buildScores(result)
await recordScores({
  traceName: "rulebook-build",
  sessionId: runId,
  input: { split: values.split, documents: values.documents, units: values.units ?? null, promptVersions },
  output: { units: result.report.units.length, failures: result.failures },
  scores,
  recorder: ai.scores
})
await ai.flush()

writeJson(join(out, "draft.json"), {
  documents: result.documents,
  referenced: result.referencedDocuments,
  ...result.content
})
writeJson(join(out, "issues.json"), { failures: result.failures, ...result.issues })

const { calls } = result.report
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
const cost = sum(calls.map((call) => call.costUsd))
const rows = result.report.units.map(
  (unit) =>
    `| ${unit.id} | ${unit.provisions} | ${unit.isValid ? "yes" : "no"} | ${unit.repairRounds} | ${unit.problems ?? "-"} |`
)
const report = [
  `# Encoding run ${runId}`,
  "",
  `Split ${values.split}, documents ${values.documents}${values.units ? `, units ${values.units}` : ""}.`,
  `Prompts: ${Object.entries(promptVersions)
    .map(([name, version]) => `${name} v${version}`)
    .join(", ")}.`,
  "",
  `Duration ${durationSeconds.toFixed(0)} s; ${calls.length} model calls (${calls.filter((call) => call.isCached).length} cached); cost $${cost.toFixed(4)}; ${sum(calls.map((call) => call.inputTokens))} input and ${sum(calls.map((call) => call.outputTokens))} output tokens.`,
  "",
  "| Unit | Provisions | Valid | Repair rounds | Problems left |",
  "| --- | --- | --- | --- | --- |",
  ...rows,
  "",
  "| Score | Value |",
  "| --- | --- |",
  ...scores.map(
    (score) => `| ${score.name} | ${Number.isInteger(score.value) ? score.value : score.value.toFixed(3)} |`
  ),
  "",
  `Failures: ${result.failures.length === 0 ? "none" : result.failures.map((failure) => `${failure.stage} ${failure.itemId}: ${failure.message}`).join("; ")}`,
  ""
].join("\n")
writeFileSync(join(out, "report.md"), report)
console.warn(report)
console.warn(`Written to ${out}`)
