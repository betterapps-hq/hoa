import { provisionBlock } from "@/encoding/promptVariables"
import { vocabularyLine } from "@/encoding/steps/outline"
import { problemRecords, retryProblemsText } from "@/encoding/steps/ruleRetry"
import type * as T from "@/schema/types"
import type { buildDatasets, DatasetItem } from "./datasets"
import { goldenTerms } from "./golden"
import {
  oldConsolidation,
  oldDefinedTerms,
  oldFinding,
  oldRetry,
  oldStructuring,
  retryItems,
  runTerms,
  type RetryItem
} from "./oldRuns"
import { itemComparison, stepSummary, type ItemResult } from "./report"
import type { SavedRun } from "./savedRun"
import {
  missing,
  noEquivalent,
  scoreConsolidation,
  scoreDefinedTerms,
  scoreFinding,
  scoreRetry,
  scoreStructuring,
  termAlignment,
  type ItemScore
} from "./scores"

// Scores every dataset item against the old pipeline's saved runs (the v5 column), and writes nothing: the
// generator script stores the items, these results, the summaries and the comparison files.

export type Datasets = ReturnType<typeof buildDatasets> & { "rule-retry": RetryItem[] }

/** A labeled old run: the column name (such as v5) and its saved folder. */
export type LabeledRun = { label: string; run: SavedRun }

export type StepResults = {
  step: string
  /** The dataset's items, as they're stored. */
  dataset: readonly { id: string }[]
  items: ItemResult[]
  summary: string
  comparisons: { id: string; text: string }[]
}

type Scorer<I> = (item: I, run: SavedRun) => { output: unknown; score: ItemScore }

function evaluateStep<I extends DatasetItem<unknown, unknown>>(
  step: string,
  items: readonly I[],
  runs: readonly LabeledRun[],
  score: Scorer<I> | { noEquivalent: string },
  inputText: (item: I) => string
): StepResults {
  const results: ItemResult[] = []
  const comparisons: { id: string; text: string }[] = []
  const labels = [...new Set(runs.map((run) => run.label))]
  for (const item of items) {
    // A label may name several runs (one per split): the first that produced something for the item counts.
    const outputs = labels.map((label) => {
      // A run that never read the item's documents has no old result for it: missing, not wrong.
      const reads = (run: SavedRun) =>
        item.tags.document
          .split(",")
          .some((key) => run.provisions.some((provision) => provision.key.startsWith(`${key}:`)))
      const scored = runs
        .filter((run) => run.label === label)
        .map(({ run }) => {
          if ("noEquivalent" in score) {
            return { output: null, score: noEquivalent(score.noEquivalent) }
          }
          return reads(run)
            ? score(item, run)
            : { output: null, score: missing(`no old result: the run never encoded ${item.tags.document}`) }
        })
      const found = scored.find((result) => result.score.verdict !== "missing") ?? scored.at(-1)
      return { run: label, output: found?.output ?? null, score: found?.score ?? noEquivalent("no run") }
    })
    results.push({
      id: item.id,
      tags: item.tags,
      results: Object.fromEntries(outputs.map((output) => [output.run, output.score]))
    })
    comparisons.push({
      id: item.id,
      text: itemComparison({
        id: item.id,
        tags: item.tags,
        inputText: inputText(item),
        expected: item.expected,
        outputs
      })
    })
  }
  return { step, dataset: items, items: results, summary: stepSummary(step, results, labels), comparisons }
}

/** The retry items: each run's recorded failing rules, stratified by `quota`. */
export const retryDataset = (
  runs: readonly LabeledRun[],
  quota: ReadonlyMap<string, number>,
  goldenRules: readonly T.Rule[]
) => runs.flatMap(({ run }) => retryItems(run, quota, goldenRules))

/** Several goldens' results as one per step: items, comparisons and the summary over all of them. */
export function combineResults(parts: readonly StepResults[][], labels: readonly string[]): StepResults[] {
  const steps = [...new Set(parts.flatMap((part) => part.map((result) => result.step)))]
  return steps.map((step) => {
    const results = parts.flatMap((part) => part.filter((result) => result.step === step))
    const items = results.flatMap((result) => result.items)
    return {
      step,
      dataset: results.flatMap((result) => result.dataset),
      items,
      comparisons: results.flatMap((result) => result.comparisons),
      summary: stepSummary(step, items, labels)
    }
  })
}

/** Every step's results against the old runs. */
export function evaluateDatasets(datasets: Datasets, runs: readonly LabeledRun[], golden: T.RulesFile): StepResults[] {
  const terms = goldenTerms(golden)
  const alignment = new Map(runs.map(({ run }) => [run.runId, termAlignment(terms, runTerms(run))]))
  const matchesOf = (run: SavedRun) => alignment.get(run.runId) ?? new Map()
  const goldenSides = {
    terms: [...golden.terms, ...golden.proposedCore],
    documents: golden.documents,
    settings: golden.settings
  }
  return [
    evaluateStep(
      "defined-terms",
      datasets["defined-terms"],
      runs,
      (item, run) => {
        const output = oldDefinedTerms(run, item.tags.document)
        return { output, score: scoreDefinedTerms(item, output) }
      },
      (item) => item.input.definitions.map(provisionBlock).join("\n\n")
    ),
    evaluateStep(
      "rule-finding",
      datasets["rule-finding"],
      runs,
      (item, run) => {
        const output = oldFinding(run, item)
        return { output, score: scoreFinding(item, output, matchesOf(run), terms) }
      },
      (item) => item.input.unit.provisions.map(provisionBlock).join("\n\n")
    ),
    evaluateStep(
      "shared-vocabulary",
      datasets["shared-vocabulary"],
      runs,
      { noEquivalent: "the old pipeline had no shared vocabulary step: each section added its own terms" },
      (item) => item.input.outlines.map(vocabularyLine).join("\n")
    ),
    evaluateStep(
      "vocabulary-merge",
      datasets["vocabulary-merge"],
      runs,
      { noEquivalent: "the old pipeline merged terms only in consolidation, over its own pairs" },
      (item) =>
        `${item.input.entries.length} terms; ${item.expected.merges.length} planted duplicates, ${item.expected.renames.length} collisions`
    ),
    evaluateStep(
      "rule-structuring",
      datasets["rule-structuring"],
      runs,
      (item, run) => {
        const output = oldStructuring(run, item)
        return { output, score: scoreStructuring(item, output, goldenSides, matchesOf(run)) }
      },
      (item) => item.input.outlines.map(vocabularyLine).join("\n")
    ),
    evaluateStep(
      "rule-retry",
      datasets["rule-retry"],
      runs,
      (item, run) => {
        const own = problemRecords([...run.verified.values()]).find((record) => record.key === item.input.record.key)
        const output = own ? oldRetry(run, { ...item, input: { ...item.input, record: own } }) : null
        return { output, score: scoreRetry(output) }
      },
      (item) => retryProblemsText([item.input.record])
    ),
    evaluateStep(
      "consolidation",
      datasets.consolidation,
      runs,
      (item, run) => {
        const output = oldConsolidation(run, item.tags.split)
        return { output, score: scoreConsolidation(item, output) }
      },
      (item) => item.input.crossReferences.join("\n")
    )
  ]
}
