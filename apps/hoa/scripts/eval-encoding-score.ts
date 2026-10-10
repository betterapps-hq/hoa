import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { LangfuseClient } from "@langfuse/client"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import {
  comparisonFileName,
  comparisonIndex,
  provisionGroups,
  ruleComparison,
  termComparison
} from "../src/evaluation/encoding/compare.ts"
import { agentPairs } from "../src/evaluation/encoding/pairs.ts"
import { splitMembership } from "../src/evaluation/encoding/provisions.ts"
import { scoreReport } from "../src/evaluation/encoding/report.ts"
import { runCost, runDraft, runInfo, runProvisions } from "../src/evaluation/encoding/run.ts"
import { goldenTermsOf, scoreRun, splitRules, splitTermKeys } from "../src/evaluation/encoding/score.ts"
import { alignTerms, unmatchedTermGroups } from "../src/evaluation/encoding/terms.ts"
import { createVocabulary } from "../src/schema/vocabulary.ts"
import { rulesFile } from "../src/schema/zod.ts"
import { splitSelectors } from "./encodingSplits.ts"
import { encodingRuns, readJson, writeJson } from "./evalFiles.ts"

// Scores an evaluation run (eval-encoding.ts) against the golden encoding (samples/declaration/rules.json), on the
// run's split (implementation-plan.md, Evaluation round 1), in code only: no model is called. Computes structure,
// coverage and reasons, modality and check agreement (through the engine) on paired rules, term recall, validity and
// repair, and writes report.md, scores.json and the comparison files the coding agent judges rule recall, rule
// precision and pairwise quality from (compare/, evaluation.md, Judging by the coding agent). Rules and terms pair by
// key and label; the agent's pairs.json in the run folder, when there, adds the pairs it found by meaning, so a rerun
// after judging scores them.
// Usage, from apps/hoa: pnpm eval:encoding:score <run id> [--record]
// --record also records the scores as a run of the Langfuse dataset encoding-evaluation, one item per split (a
// Langfuse write: only with the person's approval).
const { positionals, values } = parseArgs({ allowPositionals: true, options: { record: { type: "boolean" } } })
const [runId] = positionals
if (!runId) {
  throw new Error("Usage: pnpm eval:encoding:score <run id> [--record]")
}
const folder = join(encodingRuns, runId)
const run = runInfo.parse(readJson(join(folder, "run.json")))
const draft = runDraft.parse(readJson(join(folder, "draft.json")))
const golden = rulesFile.parse(readJson(join(import.meta.dirname, "../samples/declaration/rules.json")))
const pairsPath = join(folder, "pairs.json")
const hasAgentPairs = existsSync(pairsPath)
const pairs = agentPairs.parse(hasAgentPairs ? readJson(pairsPath) : {})

const selectors = splitSelectors(run.split)
const pipelineProvisions = runProvisions(draft)
// The split's provisions, and of those only the units a --units run encoded.
const allProvisions = [...golden.provisions, ...pipelineProvisions]
const membership = [selectors, run.units?.split(",") ?? null].flatMap((keys) =>
  keys === null ? [] : [splitMembership(allProvisions, keys)]
)
const inSplit = (key: string) => membership.every((isIn) => isIn(key))

const scores = scoreRun({ golden, draft, report: run.report, inSplit, pairs })
const report = scoreReport({
  runId,
  split: run.split,
  promptVersions: run.promptVersions,
  encodingCost: runCost(run.report),
  hasAgentPairs,
  scores
})
writeFileSync(join(folder, "report.md"), report)
writeJson(join(folder, "scores.json"), scores)

// The comparison files, rewritten on every scoring so they show the current pairs.
const compareFolder = join(folder, "compare")
rmSync(compareFolder, { recursive: true, force: true })
mkdirSync(join(compareFolder, "rules"), { recursive: true })
const provisions = new Map([...pipelineProvisions, ...golden.provisions].map((provision) => [provision.key, provision]))
const goldenTerms = goldenTermsOf(golden)
const vocabularies = { reference: createVocabulary(goldenTerms), pipeline: createVocabulary([...draft.terms]) }
const groups = provisionGroups(splitRules(golden, inSplit), draft.rules)
for (const group of groups) {
  writeFileSync(
    join(compareFolder, comparisonFileName(group.provisionKey)),
    ruleComparison(group, { provisions, vocabularies, details: scores.details })
  )
}
const termGroups = unmatchedTermGroups(
  goldenTerms,
  draft.terms,
  alignTerms(goldenTerms, draft.terms, pairs.terms),
  splitTermKeys(golden, inSplit)
)
writeFileSync(join(compareFolder, "terms.md"), termComparison(termGroups, scores.details.terms.missing))
writeFileSync(join(compareFolder, "README.md"), comparisonIndex(runId, groups, scores.details))

if (values.record) {
  // The scores as a Langfuse dataset run: one item per split, one run per evaluation run, a score per measure.
  const ai = createAiContext()
  if (!ai.isConfigured) {
    throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
  }
  const langfuse = new LangfuseClient()
  const datasetName = "encoding-evaluation"
  const existing = await langfuse.api.datasets.list({ limit: 100 })
  if (!existing.data.some((dataset) => dataset.name === datasetName)) {
    await langfuse.api.datasets.create({
      name: datasetName,
      description:
        "The sample Declaration's encoding against the golden encoding, one item per split (evaluation round 1)."
    })
  }
  await langfuse.api.datasetItems.create({
    datasetName,
    id: `encoding-${run.split}`,
    input: { documents: run.documents, split: run.split, selectors }
  })
  const dataset = await langfuse.dataset.get(datasetName)
  const experiment = await langfuse.experiment.run({
    name: "encoding-evaluation",
    runName: runId,
    metadata: { promptVersions: run.promptVersions, hasAgentPairs },
    data: dataset.items.filter((item) => item.id === `encoding-${run.split}`),
    task: async () => Object.fromEntries(scores.measures.map((measure) => [measure.name, measure.value])),
    evaluators: [
      async () =>
        scores.measures.map((measure) => ({
          name: `encoding-${measure.name}`,
          value: measure.value,
          comment: measure.passed ? "clears the bar" : "misses the bar"
        }))
    ]
  })
  await ai.flush()
  console.warn(`Langfuse dataset run: ${experiment.datasetRunUrl ?? experiment.runName}`)
}

console.warn(report.split("\n## ")[0])
console.warn(`Written to ${folder}; comparison files in ${compareFolder}`)
