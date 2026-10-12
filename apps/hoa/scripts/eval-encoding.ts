import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { rulebookBuildPrompts } from "../src/ai/pipelinePrompts.ts"
import { resolvePromptVersions } from "../src/ai/promptLoader.ts"
import { recordScores } from "../src/ai/scores.ts"
import { uploadEdition } from "../src/documents/documentStructure.ts"
import { buildRulebook } from "../src/encoding/build.ts"
import { buildScores } from "../src/encoding/buildScores.ts"
import { selectsUnit } from "../src/encoding/unitSelection.ts"
import type { StepRunner } from "../src/jobs/steps.ts"
import { pageSchema } from "../src/ocr/page.ts"
import { splitSelectors } from "./encodingSplits.ts"
import { encodingRuns, fileCache, fixtures, writeJson } from "./evalFiles.ts"
import { sampleDocuments } from "./sampleDocuments.ts"

// Evaluation round 1's runner (implementation-plan.md, E1.2): runs the rulebook build in process, without a Workflow,
// on the cached page records in .fixtures/ocr/ (git-ignored: they name individuals, so nothing here prints their text),
// with the real models, traced to Langfuse as the app traces a build (session id = run id). Writes the merged draft,
// every step's output (each section's rule finding under steps/find-rules, each batch's rules under
// steps/structure-rules), the issues and a short report to .fixtures/eval/encoding/<run id>/: draft.json, issues.json,
// run.json (the rules, calls and prompt versions the scorer reads) and build.md. The scorer reads each outlined rule
// as a unit: valid when it passed Zod after F's retries, its retry rounds as repair rounds. `pnpm eval:encoding:score <run id>` scores it against the golden encoding. Usage, from
// apps/hoa:
//   pnpm eval:encoding [--split dev|test|all] [--documents declaration,design-guidelines] [--units <key>,<key>]
//     [--prompts <prompt name>=<version>,...] [--yes]
// The split is by provision key (encodingSplits.ts). --units keeps only sections holding or under the given provision
// keys or in the given documents. --prompts pins versions no label points at yet (a staged candidate); the other
// prompts are resolved by label, as a build does. Without --yes it prints what it would run and stops.
const { values } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    documents: { type: "string", default: "declaration" },
    units: { type: "string" },
    prompts: { type: "string" },
    yes: { type: "boolean", default: false }
  }
})

const split = splitSelectors(values.split)
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

/** `--prompts`: build prompt versions to pin, by name. */
function pinnedVersions(option: string | undefined) {
  return Object.fromEntries(
    (option?.split(",").filter(Boolean) ?? []).map((pin) => {
      const [name = "", version = ""] = pin.split("=")
      if (!rulebookBuildPrompts.some((prompt) => prompt.name === name) || !/^\d+$/.test(version)) {
        throw new Error(
          `--prompts takes <prompt name>=<version> for ${rulebookBuildPrompts.map((prompt) => prompt.name).join(", ")}, not ${pin}`
        )
      }
      return [name, Number(version)]
    })
  )
}

const ai = createAiContext()
if (!ai.isConfigured) {
  throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
}
const runId = `${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}-${values.split}`
const out = join(encodingRuns, runId)
const fileName = (name: string) => name.replaceAll(":", "~")

/** Runs a step in process, keeping its output as the Workflow would, and checking it round-trips the same way. */
const step: StepRunner = async (name, schema, run) => {
  const [stage = name, ...item] = name.split(":")
  const stored = writeJson(join(out, "steps", stage, `${fileName(item.join(":") || "result")}.json`), await run())
  return schema.parse(JSON.parse(stored))
}

const startedAt = performance.now()
// Pinned prompts aren't resolved by label: a staged candidate may have no label yet.
const pinned = pinnedVersions(values.prompts)
const promptVersions = {
  ...(await resolvePromptVersions(
    ai.loadPrompt,
    rulebookBuildPrompts.filter((prompt) => !(prompt.name in pinned))
  )),
  ...pinned
}
console.warn(
  `Run ${runId}: ${documents.map((document) => document.fixture).join(", ")}; prompts ${JSON.stringify(promptVersions)}`
)
if (!values.yes) {
  console.warn("Dry run: pass --yes to run the build with the real models (each run needs the person's approval).")
  process.exit(0)
}
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
  concurrency: ai.encodingConcurrency,
  selectUnits: (unit) =>
    (split === null || selectsUnit(split)(unit)) && (unitSelectors === null || selectsUnit(unitSelectors)(unit))
})
const durationSeconds = (performance.now() - startedAt) / 1000
const scores = buildScores(result)
await recordScores({
  traceName: "rulebook-build",
  sessionId: runId,
  input: { split: values.split, documents: values.documents, units: values.units ?? null, promptVersions },
  output: { rules: result.content.rules.length, failures: result.failures },
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
writeJson(join(out, "run.json"), {
  runId,
  split: values.split,
  documents: values.documents,
  units: values.units ?? null,
  promptVersions,
  report: {
    units: result.report.rules.map((rule) => ({
      id: rule.key,
      provisions: 1,
      isValid: rule.isValid,
      repairRounds: rule.retries,
      problems: rule.problems
    })),
    validAfterEncode: result.report.rules.filter((rule) => rule.isValid && rule.retries === 0).length,
    problemsBefore: result.report.stages.find((stage) => stage.stage === "structure-rules")?.problems ?? 0,
    calls: result.report.calls
  },
  stages: result.report.stages
})

const { calls } = result.report
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
const cost = sum(calls.map((call) => call.costUsd))
const rows = result.report.stages.map(
  (stage) =>
    `| ${stage.stage} | ${stage.items} | ${stage.calls} | ${stage.reruns} | ${stage.problems} | ${stage.problemsLeft} |`
)
const report = [
  `# Encoding run ${runId}`,
  "",
  `Split ${values.split}, documents ${values.documents}${values.units ? `, units ${values.units}` : ""}.`,
  `Prompts: ${Object.entries(promptVersions)
    .map(([name, version]) => `${name} v${version}`)
    .join(", ")}.`,
  "",
  `Duration ${durationSeconds.toFixed(0)} s; ${calls.length} model calls (${calls.filter((call) => call.isCached).length} cached); cost $${cost.toFixed(4)}; ${sum(calls.map((call) => call.inputTokens))} input tokens (${sum(calls.map((call) => call.cachedInputTokens))} read from the prompt cache, ${sum(calls.map((call) => call.cacheWriteTokens))} written to it) and ${sum(calls.map((call) => call.outputTokens))} output tokens.`,
  "",
  "| Stage | Items | Calls | Reruns and retries | Problems found | Problems left |",
  "| --- | --- | --- | --- | --- | --- |",
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
writeFileSync(join(out, "build.md"), report)
console.warn(report)
console.warn(`Written to ${out}`)
