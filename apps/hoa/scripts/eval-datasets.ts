import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { buildDatasets } from "../src/evaluation/encoding/steps/datasets.ts"
import { combineResults, evaluateDatasets, retryDataset } from "../src/evaluation/encoding/steps/evaluate.ts"
import { fixtures, writeJson } from "./evalFiles.ts"
import { defaultRetryQuota, defaultRuns, goldenContext, goldenSamples, labeledRuns, pairs } from "./stepDatasets.ts"

// The per-step datasets (evaluation.md, Datasets): items built by code from every golden encoding in samples/ (input as
// the step receives it, expected output, slice tags), scored against the old pipeline's saved runs (the v3 and v5
// columns) with no model call, written to .fixtures/eval/datasets/<step>/ (git-ignored: items quote the documents):
// items/<id>.json, results.json (each item's verdict and metrics per run), summary.md and compare/<id>.md for the
// coding agent. Nothing goes to Langfuse. Usage, from apps/hoa:
//   pnpm eval:datasets [--runs <label>=<run id>,...] [--retry-quota <class prefix>=<count>,...]
// A label may name several runs (a dev and a test run); the first that covers an item counts. The retry corpus is the
// runs' recorded failing rules, at most --retry-quota per problem class.
const { values } = parseArgs({
  options: {
    runs: { type: "string", default: defaultRuns },
    "retry-quota": { type: "string", default: defaultRetryQuota }
  }
})

const contexts = goldenSamples().map((sample) => goldenContext(sample))
const runs = labeledRuns(values.runs)
const quota = new Map(pairs(values["retry-quota"]).map(([prefix, count]) => [prefix, Number(count)]))
const retry = retryDataset(
  runs,
  quota,
  contexts.flatMap((context) => context.golden.rules)
)
// Each golden makes its own items; the retry corpus (from the old runs) is evaluated once, with the first.
const results = combineResults(
  contexts.map((context, index) =>
    evaluateDatasets({ ...buildDatasets(context), "rule-retry": index === 0 ? retry : [] }, runs, context.golden)
  ),
  [...new Set(runs.map((run) => run.label))]
)

const root = join(fixtures, "eval/datasets")
const fileName = (id: string) => id.replaceAll(/[:/\\#*?"<>|]/g, "~")
const index: string[] = ["# Encoding step datasets", "", "| Step | Items |", "| --- | --- |"]
for (const result of results) {
  const folder = join(root, result.step)
  rmSync(folder, { recursive: true, force: true })
  const items = result.dataset
  for (const item of items) {
    writeJson(join(folder, "items", `${fileName(item.id)}.json`), item)
  }
  writeJson(join(folder, "results.json"), result.items)
  mkdirSync(join(folder, "compare"), { recursive: true })
  for (const comparison of result.comparisons) {
    writeFileSync(join(folder, "compare", `${fileName(comparison.id)}.md`), comparison.text)
  }
  writeFileSync(join(folder, "summary.md"), result.summary)
  index.push(`| [${result.step}](${result.step}/summary.md) | ${items.length} |`)
  console.warn(result.summary.split("\n## By slice")[0])
}
writeFileSync(join(root, "README.md"), `${index.join("\n")}\n`)
console.warn(`Written to ${root}`)
