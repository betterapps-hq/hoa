import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { defaultDocumentStructure, knownDocumentsOf } from "../src/documents/documentStructure.ts"
import { governingDocumentKinds } from "../src/documents/governingDocument.ts"
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
// Golden encodings of other organizations' documents (golden-skeleton.ts): their text stays out of the repository.
const peerGoldens = join(import.meta.dirname, "../../../.fixtures/goldens")

const withRules = (folder: string) =>
  existsSync(folder) ? readdirSync(folder).filter((name) => existsSync(join(folder, name, "rules.json"))) : []

/** The samples with a golden encoding (samples/<name>/rules.json), which the old runs encoded. Other organizations'
 * goldens (.fixtures/goldens/<name>) were never encoded by them: `eval:step --golden <name>` runs those. */
export const goldenSamples = () => withRules(samples).toSorted()

/** A golden encoding with its splits (dev, test) and the references the build's grammar finds in it. */
export function goldenContext(sample = "declaration"): GoldenContext {
  if (!existsSync(join(samples, sample, "rules.json"))) {
    return peerGoldenContext(sample)
  }
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

/** Another organization's golden: its documents are known by their default names, and the whole golden sits in
 * one split, dev unless the folder's split.json says {"split": "test"}, so a held-out organization stays unseen. */
function peerGoldenContext(sample: string): GoldenContext {
  const folder = join(peerGoldens, sample)
  const golden = rulesFile.parse(readJson(join(folder, "rules.json")))
  const split = existsSync(join(folder, "split.json"))
    ? z.object({ split: z.enum(["dev", "test"]) }).parse(readJson(join(folder, "split.json"))).split
    : "dev"
  const defaults = governingDocumentKinds.map((kind) => defaultDocumentStructure(kind))
  const known = golden.documents.map((document) => ({
    key: document.key,
    names: defaults.find((structure) => structure.kind === document.kind)?.names ?? []
  }))
  return { golden, references: goldenReferences(golden, known), splitOf: () => split }
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
