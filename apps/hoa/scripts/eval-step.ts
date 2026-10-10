import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { findTermCandidates } from "../src/encoding/definedTerms.ts"
import { crossReferenceLines } from "../src/encoding/steps/consolidation.ts"
import { structuringBatches } from "../src/encoding/steps/ruleStructuring.ts"
import type { StepAi } from "../src/encoding/steps/run.ts"
import { vocabularyGroups, withReadKeys } from "../src/encoding/steps/vocabulary.ts"
import { buildDatasets, settingsFlags, type DatasetItem } from "../src/evaluation/encoding/steps/datasets.ts"
import { retryDataset } from "../src/evaluation/encoding/steps/evaluate.ts"
import { goldenOutlines, goldenSections, goldenTerms, sectionOf } from "../src/evaluation/encoding/steps/golden.ts"
import { replayStage, replayStages, written } from "../src/evaluation/encoding/steps/replay.ts"
import { itemComparison, itemResults, stepRunReport, type ItemResult } from "../src/evaluation/encoding/steps/report.ts"
import { readSavedRun } from "../src/evaluation/encoding/steps/savedRun.ts"
import {
  scoreConsolidation,
  scoreDefinedTerms,
  scoreFinding,
  scoreMerge,
  scoreRetry,
  scoreStructuring,
  scoreVocabulary,
  termAlignment,
  type ItemScore
} from "../src/evaluation/encoding/steps/scores.ts"
import {
  handoff as handoffSchema,
  runConsolidation,
  runDefinedTerms,
  runRuleFinding,
  runRuleRetry,
  runRuleStructuring,
  runSharedVocabulary,
  runVocabularyMerge,
  type Handoff,
  type StepRun
} from "../src/evaluation/encoding/steps/stage.ts"
import { encodingRuns, fileCache, fixtures, readJson, writeJson } from "./evalFiles.ts"
import { defaultRetryQuota, defaultRuns, goldenContext, labeledRuns, pairs } from "./stepDatasets.ts"

// Runs one encoding step alone (evaluation.md, Running one step), so a drafted prompt is tested on its own before it's
// wired into the build, and a step of today's build can be replayed. A drafted step runs over its dataset's items
// (inputs built from the golden, so the step is measured against perfect upstream input), or over the frozen output of
// an earlier run: a build run's saved steps (--from <run under .fixtures/eval/encoding>) for B, E and the retry, or an
// earlier step run (--from <run under .fixtures/eval/steps>) for the next step in the chain. A replayed build stage
// (vocabulary, encode, repair, consolidate) reads a build run's saved steps and checks that the content cache gives back
// exactly what the run saved. Each run writes run.json, outputs/, handoff.json, report.md (calls, cost, time, cached
// tokens, problems by class, scores beside the old runs') and compare/ to .fixtures/eval/steps/<run id>/.
//
// Model calls cost money: without --yes this prints what it would run and stops. Usage, from apps/hoa:
//   pnpm eval:step --stage <step> [--from <run>] [--items <id part>,...] [--prompts <name>=<version>,...]
//     [--golden <sample>] [--repeat <n>] [--reruns <0-1>] [--retries <0-2>] [--runs <label>=<run id>,...] [--yes]
// --reruns reruns a failing item of B, E or C once with its problems (as the pipeline does); --retries runs F's retry
// on the rules still failing, at most twice.
// Steps: defined-terms, rule-finding, shared-vocabulary, vocabulary-merge, rule-structuring, rule-retry,
// consolidation; and the build's vocabulary, encode, repair, consolidate.
const { values } = parseArgs({
  options: {
    stage: { type: "string" },
    from: { type: "string" },
    items: { type: "string" },
    prompts: { type: "string" },
    repeat: { type: "string", default: "1" },
    retries: { type: "string", default: "0" },
    reruns: { type: "string", default: "1" },
    golden: { type: "string", default: "declaration" },
    runs: { type: "string", default: defaultRuns },
    "retry-quota": { type: "string", default: defaultRetryQuota },
    yes: { type: "boolean", default: false }
  }
})

const stage = values.stage ?? ""
const stepsRoot = join(fixtures, "eval/steps")
const runId = `${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}-${stage}`
const out = join(stepsRoot, runId)
const fileName = (id: string) => id.replaceAll(/[:/\\#*?"<>|]/g, "~")
const wanted = (id: string) => !values.items || values.items.split(",").some((part) => id.includes(part))
const repeats = Math.max(1, Number(values.repeat))

const pinned = Object.fromEntries(
  pairs(values.prompts).map(([name, version]) => {
    if (!/^\d+$/.test(version)) {
      throw new Error(`--prompts takes <prompt name>=<version>, not ${name}=${version}`)
    }
    return [name, Number(version)]
  })
)

let context: ReturnType<typeof createAiContext> | null = null

/** The models and Langfuse, created only once the run is confirmed. */
function stepAi(): StepAi {
  context ??= createAiContext()
  const ai = context
  if (!ai.isConfigured) {
    throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
  }
  return {
    loadPrompt: ai.loadPrompt,
    createModel: ai.createModel,
    modelId: ai.modelId,
    environment: ai.environment,
    sessionId: runId,
    promptVersions: pinned,
    cache: (name) => fileCache(name)
  }
}

function confirm(calls: number, what: string) {
  console.warn(
    `${stage}: ${what}; about ${calls} model call${calls === 1 ? "" : "s"} per repeat, ${repeats} repeat(s).`
  )
  console.warn(`Prompts pinned: ${JSON.stringify(pinned)} (others by label). Cached answers cost nothing.`)
  if (!values.yes) {
    console.warn("Dry run: pass --yes to call the models (each run needs the person's approval).")
    process.exit(0)
  }
}

const flush = async () => {
  if (context?.isConfigured) {
    await context.flush()
  }
}

// ─── Replays of the build's stages ──────────────────────────────────────────────────────────────

const replay = replayStages.find((name) => name === stage)
if (replay) {
  if (!values.from) {
    throw new Error("A build stage replays from a saved run: --from <run id under .fixtures/eval/encoding>")
  }
  const run = readSavedRun(join(encodingRuns, values.from))
  confirm(
    stage === "consolidate" ? 1 : run.units.filter((unit) => wanted(unit.id)).length,
    `replay from ${values.from}`
  )
  const started = performance.now()
  const items = await replayStage({ stage: replay, run, ai: stepAi(), select: wanted })
  await flush()
  for (const item of items) {
    writeJson(join(out, "steps", stage, `${fileName(item.itemId)}.json`), { output: item.output, call: item.call })
  }
  const reproduced = items.filter((item) => item.reproduced).length
  writeJson(join(out, "run.json"), {
    runId,
    stage,
    from: values.from,
    promptVersions: pinned,
    items: items.map(({ itemId, reproduced, call }) => ({ itemId, reproduced, call }))
  })
  const report = stepRunReport({
    runId,
    stage,
    source: `build run ${values.from}`,
    promptVersions: pinned,
    wallSeconds: (performance.now() - started) / 1000,
    calls: items.map((item) => item.call),
    problems: [],
    items: [],
    runs: [],
    extra: [
      `Reproduced exactly: ${reproduced} of ${items.length}.`,
      ...items.filter((item) => !item.reproduced).map((item) => `- ${item.itemId} differs from the saved output`)
    ]
  })
  writeFileSync(join(out, "report.md"), report)
  console.warn(report)
  process.exit(0)
}

// ─── Drafted steps ──────────────────────────────────────────────────────────────────────────────

const goldenSet = goldenContext(values.golden)
const { golden } = goldenSet
const datasets = buildDatasets(goldenSet)
const oldRuns = labeledRuns(values.runs)
const fromBuild =
  values.from && existsSync(join(encodingRuns, values.from)) ? readSavedRun(join(encodingRuns, values.from)) : null
const fromStep =
  values.from && !fromBuild ? handoffSchema.parse(readJson(join(stepsRoot, values.from, "handoff.json"))) : null
if (values.from && !fromBuild && !fromStep) {
  throw new Error(`No run ${values.from} under .fixtures/eval/encoding or .fixtures/eval/steps`)
}
const goldenProvisions = golden.provisions
const goldenDocuments = golden.documents
const goldenSides = {
  terms: [...golden.terms, ...golden.proposedCore],
  documents: golden.documents,
  settings: golden.settings
}
const allGoldenTerms = goldenTerms(golden)
const sections = goldenSections(golden, goldenSet.references)

/** The dataset's old-run results for the step, when eval:datasets has written them. */
function oldResults(step: string): Map<string, Record<string, ItemScore>> {
  const path = join(fixtures, "eval/datasets", step, "results.json")
  if (!existsSync(path)) {
    return new Map()
  }
  const items = itemResults.parse(JSON.parse(readFileSync(path, "utf8")))
  return new Map(items.map((item) => [item.id, item.results]))
}

/**
 * Runs a drafted step over its items `repeats` times (each repeat with its own content cache), scores every output
 * whose item has an expected output, and writes the run's folder.
 */
async function runDrafted<I extends DatasetItem<unknown, unknown>, O>(input: {
  items: readonly I[]
  calls: number
  source: string
  run: (items: readonly I[], cacheStage: string) => Promise<StepRun<O>>
  score: ((item: I, output: O | null) => ItemScore) | null
  previous: Handoff
  keysOf?: (output: O) => string[]
}) {
  const items = input.items.filter((item) => wanted(item.id))
  confirm(input.calls === 0 ? items.length : input.calls, `${items.length} item(s) from ${input.source}`)
  const started = performance.now()
  const runs: StepRun<O>[] = []
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    runs.push(await input.run(items, repeat === 1 ? stage : `${stage}~${repeat}`))
  }
  await flush()
  const old = oldResults(stage)
  const labels = runs.map((_run, index) => (repeats === 1 ? "this run" : `repeat ${index + 1}`))
  const oldLabels = [...new Set([...old.values()].flatMap((results) => Object.keys(results)))]
  const results: ItemResult[] = items.map((item) => ({
    id: item.id,
    tags: item.tags,
    results: {
      ...Object.fromEntries(
        runs.flatMap((run, index) =>
          input.score ? [[labels[index] ?? "", input.score(item, run.outputs.get(item.id) ?? null)] as const] : []
        )
      ),
      ...old.get(item.id)
    }
  }))
  // Key stability across repeats: the share of items whose outputs name the same keys in every repeat.
  const stability =
    input.keysOf && runs.length > 1
      ? items.filter((item) => {
          const keys = runs.map((run) => {
            const output = run.outputs.get(item.id)
            return output ? (input.keysOf?.(output) ?? []).toSorted().join() : ""
          })
          return keys.every((key) => key === keys[0])
        }).length / Math.max(1, items.length)
      : null
  const calls = runs.flatMap((run) => run.calls)
  const problems = runs.flatMap((run) => run.problems)
  mkdirSync(join(out, "compare"), { recursive: true })
  runs.forEach((run, index) => {
    for (const item of items) {
      writeJson(join(out, "outputs", `${index + 1}`, `${fileName(item.id)}.json`), run.outputs.get(item.id) ?? null)
    }
  })
  writeJson(join(out, "handoff.json"), { ...input.previous, ...runs[0]?.handoff })
  writeJson(join(out, "run.json"), {
    runId,
    stage,
    from: input.source,
    promptVersions: pinned,
    repeats,
    calls,
    problems
  })
  writeJson(join(out, "scores.json"), results)
  for (const item of items) {
    const scores = results.find((result) => result.id === item.id)?.results ?? {}
    writeFileSync(
      join(out, "compare", `${fileName(item.id)}.md`),
      itemComparison({
        id: item.id,
        tags: item.tags,
        inputText: written(item.input).slice(0, 20_000),
        expected: item.expected,
        outputs: runs.map((run, index) => ({
          run: labels[index] ?? "",
          output: run.outputs.get(item.id) ?? null,
          score: scores[labels[index] ?? ""] ?? { verdict: "missing", metrics: {}, notes: ["no expected output"] }
        }))
      })
    )
  }
  const report = stepRunReport({
    runId,
    stage,
    source: input.source,
    promptVersions: pinned,
    wallSeconds: (performance.now() - started) / 1000,
    calls,
    problems,
    items: results,
    runs: input.score ? [...labels, ...oldLabels] : oldLabels,
    extra: stability === null ? [] : [`Key stability across repeats: ${stability.toFixed(3)} of items.`]
  })
  writeFileSync(join(out, "report.md"), report)
  console.warn(report)
  console.warn(`Written to ${out}`)
}

const reruns = Number(values.reruns)
/** B's terms for E's label resolution and C's input: from the step run handed on, else the golden's. */
const definedTerms = fromStep?.definedTerms ?? datasets["shared-vocabulary"][0]?.input.definedTerms ?? []

const termKeys = (output: { terms: readonly { key: string }[] }) => output.terms.map((term) => term.key)
const byId = <I extends { id: string }>(items: readonly I[]) => new Map(items.map((item) => [item.id, item]))

switch (stage) {
  case "defined-terms": {
    const expected = byId(datasets["defined-terms"])
    const items = fromBuild
      ? [
          ...new Set(fromBuild.provisions.map((provision) => provision.key.slice(0, provision.key.indexOf(":"))))
        ].flatMap((documentKey) => {
          const provisions = fromBuild.provisions.filter((provision) => provision.key.startsWith(`${documentKey}:`))
          const definitions = provisions.filter((provision) => provision.kind === "definition")
          const document = fromBuild.merge?.rulebook.documents.find((found) => found.key === documentKey)
          const id = `defined-terms:${documentKey}`
          const golden = expected.get(id)
          return !document || !golden
            ? []
            : [{ ...golden, input: { document, definitions, candidates: findTermCandidates(provisions) } }]
        })
      : datasets["defined-terms"]
    await runDrafted({
      items,
      calls: 0,
      source: fromBuild ? `build run ${fromBuild.runId}` : "the golden dataset",
      run: (selected, cacheStage) => runDefinedTerms(selected, { ai: stepAi(), cacheStage, reruns }),
      score: scoreDefinedTerms,
      previous: {},
      keysOf: termKeys
    })
    break
  }
  case "rule-finding": {
    const expected = byId(datasets["rule-finding"])
    const items = fromBuild
      ? fromBuild.units.flatMap((unit) => {
          const golden = expected.get(`rule-finding:${unit.id}`)
          const documents = (fromBuild.merge?.rulebook.documents ?? []).map(({ key, kind, title, edition }) => ({
            key,
            kind,
            title,
            edition
          }))
          const definitions = fromBuild.provisions.filter((provision) => provision.kind === "definition")
          return golden ? [{ ...golden, input: { unit, documents, definitions, knownTerms: [] } }] : []
        })
      : datasets["rule-finding"]
    await runDrafted({
      items,
      calls: 0,
      source: fromBuild ? `build run ${fromBuild.runId}` : "the golden dataset",
      run: (selected, cacheStage) =>
        runRuleFinding(selected, {
          ai: stepAi(),
          cacheStage,
          reruns,
          definedTerms,
          provisions: fromBuild?.provisions ?? goldenProvisions
        }),
      score: (item, output) => scoreFinding(item, output, termAlignment(allGoldenTerms, allGoldenTerms)),
      previous: fromStep ?? {},
      keysOf: (output) => output.provisions.flatMap((entry) => entry.outlines.map((outline) => outline.key))
    })
    break
  }
  case "shared-vocabulary": {
    // From an E run: its outlines, grouped as the dataset groups the golden's sections.
    const outlines = fromStep?.outlines ?? null
    const items = outlines
      ? vocabularyGroups(sections).flatMap((group) => {
          const golden = datasets["shared-vocabulary"].find((item) => item.id === `shared-vocabulary:${group.id}`)
          const ids = new Set(group.units.map((unit) => unit.id))
          const own = outlines.filter((outline) => ids.has(outline.unitId))
          const cited = new Set(own.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
          const input = {
            ...golden?.input,
            groupId: group.id,
            outlines: own,
            provisions: goldenProvisions.filter((provision) => cited.has(provision.key)),
            definedTerms,
            previous: [],
            documents: goldenSet.golden.documents.map(({ key, kind, title, edition }) => ({
              key,
              kind,
              title,
              edition
            }))
          }
          return golden ? [{ ...golden, input }] : []
        })
      : datasets["shared-vocabulary"]
    await runDrafted({
      items,
      calls: 0,
      source: fromStep ? `step run ${values.from}` : "the golden dataset",
      run: (selected, cacheStage) => runSharedVocabulary(selected, { ai: stepAi(), cacheStage, reruns }),
      score: scoreVocabulary,
      previous: fromStep ?? { outlines: goldenOutlines(golden, sections), settingsFlags: settingsFlags(golden) },
      keysOf: termKeys
    })
    break
  }
  case "vocabulary-merge": {
    const items = fromStep?.entries
      ? [
          {
            id: `vocabulary-merge:${values.from}`,
            step: "vocabulary-merge",
            tags: { document: "all", split: "all", topics: [], features: [] },
            input: { entries: fromStep.entries },
            expected: { merges: [], renames: [], distinct: [] }
          }
        ]
      : datasets["vocabulary-merge"]
    await runDrafted({
      items,
      calls: items.length,
      source: fromStep ? `step run ${values.from}` : "the synthetic duplicate set",
      run: (selected, cacheStage) => runVocabularyMerge(selected, { ai: stepAi(), cacheStage }),
      score: fromStep ? null : scoreMerge,
      previous: fromStep ?? {}
    })
    break
  }
  case "rule-structuring": {
    // From a C-merge (or C) run: E's outlines with the term keys that serve them, and the whole frozen vocabulary.
    const chained =
      fromStep?.outlines && fromStep.terms
        ? structuringBatches(withReadKeys(fromStep.outlines, new Map(Object.entries(fromStep.serves ?? {})))).map(
            (batch) => {
              const cited = new Set(batch.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
              const keys = new Set(batch.map((outline) => outline.key))
              const targeted = new Set(batch.flatMap((outline) => outline.resolved?.rules ?? []))
              return {
                id: `rule-structuring:${batch[0]?.key ?? ""}`,
                step: "rule-structuring",
                tags: { document: "all", split: "all", topics: [], features: [] },
                input: {
                  batchId: batch[0]?.key ?? "",
                  outlines: batch,
                  related: (fromStep.outlines ?? []).filter(
                    (outline) => targeted.has(outline.key) && !keys.has(outline.key)
                  ),
                  vocabulary: (fromStep.terms ?? []).map((term) => ({ ...term })),
                  documents: goldenDocuments.map(({ key, kind, title, edition }) => ({ key, kind, title, edition })),
                  provisions: goldenProvisions.filter((provision) => cited.has(provision.key)),
                  settingsFlags: (fromStep.settingsFlags ?? []).filter((flag) => cited.has(flag.provisionKey))
                },
                expected: { rules: golden.rules.filter((rule) => keys.has(rule.key)).map((rule) => ({ ...rule })) }
              }
            }
          )
        : null
    await runDrafted({
      items: chained ?? datasets["rule-structuring"],
      calls: 0,
      source: fromStep ? `step run ${values.from}` : "the golden dataset",
      run: (selected, cacheStage) =>
        runRuleStructuring(selected, {
          ai: stepAi(),
          cacheStage,
          provisions: goldenProvisions,
          documents: goldenDocuments,
          retries: Number(values.retries)
        }),
      score: (item, output) =>
        scoreStructuring(item, output, goldenSides, termAlignment(allGoldenTerms, output?.terms ?? allGoldenTerms)),
      previous: fromStep ?? {}
    })
    break
  }
  case "rule-retry": {
    const quota = new Map(pairs(values["retry-quota"]).map(([prefix, count]) => [prefix, Number(count)]))
    const sources = fromBuild ? [{ label: fromBuild.runId, run: fromBuild }] : oldRuns
    await runDrafted({
      items: retryDataset(sources, quota, golden.rules),
      calls: 0,
      source: fromBuild ? `build run ${fromBuild.runId}` : "the old runs' recorded failures",
      run: (selected, cacheStage) => runRuleRetry(selected, { ai: stepAi(), cacheStage, documents: goldenDocuments }),
      score: (_item, output) => scoreRetry(output),
      previous: {}
    })
    break
  }
  case "consolidation": {
    // From an F run: its rules, per split, with the golden's cross-references.
    const section = sectionOf(sections)
    const items = fromStep?.rules
      ? datasets.consolidation.map((item) => {
          const rules = (fromStep.rules ?? []).filter(
            (rule) => goldenSet.splitOf(rule.citations[0]?.provisionKey ?? "") === item.tags.split
          )
          return {
            ...item,
            input: {
              ...item.input,
              rules,
              terms: (fromStep.terms ?? item.input.terms).map((term) => ({ ...term })),
              crossReferences: crossReferenceLines({
                rules,
                references: goldenSet.references,
                sectionOf: section,
                unresolved: fromStep.unresolved
              })
            }
          }
        })
      : datasets.consolidation
    await runDrafted({
      items,
      calls: 0,
      source: fromStep ? `step run ${values.from}` : "the golden dataset",
      run: (selected, cacheStage) => runConsolidation(selected, { ai: stepAi(), cacheStage }),
      score: scoreConsolidation,
      previous: fromStep ?? {}
    })
    break
  }
  default:
    throw new Error(
      `--stage is one of defined-terms, rule-finding, shared-vocabulary, vocabulary-merge, rule-structuring, rule-retry, consolidation, ${replayStages.join(", ")}`
    )
}
