import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { knownDocumentsOf } from "../src/documents/documentStructure.ts"
import { splitMembership } from "../src/evaluation/encoding/provisions.ts"
import { noSplit, type GoldenContext } from "../src/evaluation/encoding/steps/datasets.ts"
import type { LabeledRun } from "../src/evaluation/encoding/steps/evaluate.ts"
import { goldenReferences } from "../src/evaluation/encoding/steps/golden.ts"
import { readSavedRun } from "../src/evaluation/encoding/steps/savedRun.ts"
import { rulesFile } from "../src/schema/zod.ts"
import { splitSelectors } from "./encodingSplits.ts"
import { encodingRuns, readJson } from "./evalFiles.ts"
import { sampleDocuments } from "./sampleDocuments.ts"

// What the step datasets' scripts share: the golden encoding with its splits and references, the old runs they're
// compared with, and comma-separated `name=value` options.

export const defaultRuns = "v3=2026-10-09T22-47-00-dev,v3=2026-10-09T22-45-54-test,v5=2026-10-09T23-14-52-dev"
export const defaultRetryQuota = "undefined-term=10,type-mismatch=8,invariant=4,shape=8"

export const pairs = (option: string | undefined) =>
  (option ?? "")
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [name = "", value = ""] = pair.split("=")
      return [name, value] as const
    })

const samples = join(import.meta.dirname, "../samples")

/** The samples with a golden encoding (samples/<name>/rules.json). */
export const goldenSamples = () =>
  readdirSync(samples)
    .filter((name) => existsSync(join(samples, name, "rules.json")))
    .toSorted()

/** A golden encoding with its splits (dev, test) and the references the build's grammar finds in it. */
export function goldenContext(sample = "declaration"): GoldenContext {
  const golden = rulesFile.parse(readJson(join(samples, sample, "rules.json")))
  const dev = splitMembership(golden.provisions, splitSelectors("dev") ?? [])
  const test = splitMembership(golden.provisions, splitSelectors("test") ?? [])
  const known = sampleDocuments.flatMap((document) => knownDocumentsOf(document.structure))
  return {
    golden,
    references: goldenReferences(golden, known),
    splitOf: (key) => {
      if (dev(key)) {
        return "dev"
      }
      return test(key) ? "test" : noSplit
    }
  }
}

/** Saved runs by label; a run that isn't there is left out with a warning. */
export function labeledRuns(option: string): LabeledRun[] {
  return pairs(option).flatMap(([label, runId]) => {
    const folder = join(encodingRuns, runId)
    if (!existsSync(folder)) {
      console.warn(`No run ${runId}: its column is left out.`)
      return []
    }
    return [{ label, run: readSavedRun(folder) }]
  })
}
