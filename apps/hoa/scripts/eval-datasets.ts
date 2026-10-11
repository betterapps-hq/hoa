import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildDatasets } from "../src/evaluation/encoding/steps/datasets.ts"
import { fixtures, writeJson } from "./evalFiles.ts"
import { goldenContext, goldenSamples } from "./stepDatasets.ts"

// The per-step datasets (evaluation.md, Encoding step datasets): items built by code from every golden encoding in
// samples/ (input as the step receives it, expected output, slice tags), with no model call, written to
// .fixtures/eval/datasets/<step>/items/<id>.json (git-ignored: items quote the documents) with an index of the steps.
// Nothing goes to Langfuse. Usage, from apps/hoa:
//   pnpm eval:datasets

// Each golden makes its own items; a step's dataset is all of them.
const byStep = new Map<string, { id: string }[]>()
for (const sample of goldenSamples()) {
  for (const [step, items] of Object.entries(buildDatasets(goldenContext(sample)))) {
    byStep.set(step, [...(byStep.get(step) ?? []), ...items])
  }
}

const root = join(fixtures, "eval/datasets")
const fileName = (id: string) => id.replaceAll(/[:/\\#*?"<>|]/g, "~")
const index: string[] = ["# Encoding step datasets", "", "| Step | Items |", "| --- | --- |"]
for (const [step, items] of byStep) {
  const folder = join(root, step)
  rmSync(folder, { recursive: true, force: true })
  for (const item of items) {
    writeJson(join(folder, "items", `${fileName(item.id)}.json`), item)
  }
  index.push(`| ${step} | ${items.length} |`)
  console.warn(`${step}: ${items.length} items`)
}
writeFileSync(join(root, "README.md"), `${index.join("\n")}\n`)
console.warn(`Written to ${root}`)
