import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { LangfuseClient } from "@langfuse/client"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { pipelinePrompts } from "../src/ai/pipelinePrompts.ts"
import { runObjectPrompt } from "../src/ai/runPrompt.ts"
import { settleEach } from "../src/encoding/build.ts"
import { encodingJudgeAnswer, judgeGroups, judgeVariables } from "../src/evaluation/encoding/judge.ts"
import { splitMembership } from "../src/evaluation/encoding/provisions.ts"
import { scoreReport } from "../src/evaluation/encoding/report.ts"
import { runCost, runDraft, runInfo, runProvisions } from "../src/evaluation/encoding/run.ts"
import { goldenTermsOf, scoreRun, splitRules, splitTermKeys } from "../src/evaluation/encoding/score.ts"
import {
  judgedTermPairs,
  termJudgeAnswer,
  termJudgeGroups,
  termJudgeVariables
} from "../src/evaluation/encoding/termJudge.ts"
import { alignTerms, type TermPair } from "../src/evaluation/encoding/terms.ts"
import { createVocabulary } from "../src/schema/vocabulary.ts"
import { rulesFile } from "../src/schema/zod.ts"
import { splitSelectors } from "./encodingSplits.ts"
import { encodingRuns, fileCache, readJson, writeJson } from "./evalFiles.ts"

// Scores an evaluation run (eval-encoding.ts) against the golden encoding (samples/declaration/rules.json), on the
// run's split (implementation-plan.md, Evaluation round 1): structure, coverage and reasons, the judge's pairing,
// faithfulness and pairwise comparison (hoa-eval-encoding-judge, one call per provision, traced and cached), modality,
// check agreement through the engine, term recall (with hoa-eval-term-judge pairing terms by meaning), validity and
// repair. Writes report.md and scores.json to the run's folder and records the scores as a run of the Langfuse dataset
// encoding-evaluation, one item per split.
// Usage, from apps/hoa: pnpm eval:encoding:score <run id>
const { positionals } = parseArgs({ allowPositionals: true })
const [runId] = positionals
if (!runId) {
  throw new Error("Usage: pnpm eval:encoding:score <run id>")
}
const folder = join(encodingRuns, runId)
const run = runInfo.parse(readJson(join(folder, "run.json")))
const draft = runDraft.parse(readJson(join(folder, "draft.json")))
const golden = rulesFile.parse(readJson(join(import.meta.dirname, "../samples/declaration/rules.json")))

const selectors = splitSelectors(run.split)
const pipelineProvisions = runProvisions(draft)
// The split's provisions, and of those only the units a --units run encoded.
const allProvisions = [...golden.provisions, ...pipelineProvisions]
const membership = [selectors, run.units?.split(",") ?? null].flatMap((keys) =>
  keys === null ? [] : [splitMembership(allProvisions, keys)]
)
const inSplit = (key: string) => membership.every((isIn) => isIn(key))

/** Runs a judge call again when it fails, as a Workflow step would be: a refused answer isn't cached. */
async function retried<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (attempts <= 1) {
      throw error
    }
    return retried(run, attempts - 1)
  }
}

const ai = createAiContext()
if (!ai.isConfigured) {
  throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
}
const provisions = new Map([...pipelineProvisions, ...golden.provisions].map((provision) => [provision.key, provision]))
const vocabularies = {
  reference: createVocabulary([...golden.terms, ...golden.proposedCore]),
  pipeline: createVocabulary([...draft.terms])
}
const groups = judgeGroups(splitRules(golden, inSplit), draft.rules)
console.warn(`Judging ${groups.length} provisions of run ${runId}`)
let done = 0
const results = await settleEach(groups, 8, async (group) => {
  const result = await retried(() =>
    runObjectPrompt({
      loadPrompt: ai.loadPrompt,
      createModel: ai.createModel,
      defaultModelId: ai.modelId,
      prompt: pipelinePrompts.encodingJudge,
      schema: encodingJudgeAnswer,
      variables: judgeVariables(group, provisions, vocabularies),
      traceName: "encoding-judge",
      environment: ai.environment,
      sessionId: `${runId}-score`,
      cache: fileCache("judge")
    })
  )
  done += 1
  if (done % 20 === 0) {
    console.warn(`  judged ${done}/${groups.length}`)
  }
  return { group, answer: result.object, costUsd: result.costUsd ?? 0, version: result.promptVersion }
})
const failed = results.flatMap((result, i) =>
  result.status === "rejected" ? [`${groups[i]?.provisionKey}: ${String(result.reason)}`] : []
)
if (failed.length > 0) {
  throw new Error(`The judge failed on ${failed.length} provisions:\n${failed.join("\n")}`)
}
const judged = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))

// Terms no key or label matches: the term judge pairs them by meaning, parents first, then each aligned parent's
// properties, categories and values.
const goldenTerms = goldenTermsOf(golden)
const termKeys = splitTermKeys(golden, inSplit)
const termPairs: TermPair[] = []
let termJudgeCost = 0
for (const phase of ["parents", "members"] as const) {
  const termGroups = termJudgeGroups(
    goldenTerms,
    draft.terms,
    alignTerms(goldenTerms, draft.terms, termPairs),
    termKeys,
    phase
  )
  console.warn(`Judging ${termGroups.length} groups of terms (${phase})`)
  const answers = await settleEach(termGroups, 8, async (group) => {
    const result = await retried(() =>
      runObjectPrompt({
        loadPrompt: ai.loadPrompt,
        createModel: ai.createModel,
        defaultModelId: ai.modelId,
        prompt: pipelinePrompts.termJudge,
        schema: termJudgeAnswer,
        variables: termJudgeVariables(group),
        traceName: "encoding-term-judge",
        environment: ai.environment,
        sessionId: `${runId}-score`,
        cache: fileCache("term-judge")
      })
    )
    termJudgeCost += result.costUsd ?? 0
    return judgedTermPairs(group, result.object)
  })
  const termFailures = answers.flatMap((answer) => (answer.status === "rejected" ? [String(answer.reason)] : []))
  if (termFailures.length > 0) {
    throw new Error(`The term judge failed on ${termFailures.length} groups:\n${termFailures.join("\n")}`)
  }
  termPairs.push(...answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : [])))
}
const judgeCost = judged.reduce((total, item) => total + item.costUsd, 0) + termJudgeCost

const scores = scoreRun({ golden, draft, report: run.report, inSplit, judged, termPairs })
const report = scoreReport({
  runId,
  split: run.split,
  promptVersions: run.promptVersions,
  judgeVersion: judged[0]?.version ?? 0,
  cost: { encoding: runCost(run.report), judge: judgeCost },
  scores
})
writeFileSync(join(folder, "report.md"), report)
writeJson(join(folder, "scores.json"), { judgeCost, ...scores })

// The scores as a Langfuse dataset run: one item per split, one run per evaluation run, a score per measure.
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
  metadata: { promptVersions: run.promptVersions, judgeCost },
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

console.warn(report.split("\n## ")[0])
console.warn(
  `Judge cost $${judgeCost.toFixed(2)}. Langfuse dataset run: ${experiment.datasetRunUrl ?? experiment.runName}`
)
console.warn(`Written to ${folder}`)
