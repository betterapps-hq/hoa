import type { Measure, RunScores } from "./score"

// A run's scores as Markdown (report.md in the run's folder): the bar table of the scores code computes, then what's
// behind every miss, by key. Rule recall, rule precision and pairwise quality are the coding agent's, judged from the
// comparison files in compare/ (compare.ts). It stays in the git-ignored run folder with them.

const number = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(3))

function barText(measure: Measure) {
  if (measure.min !== undefined) {
    return `at least ${number(measure.min)}`
  }
  return measure.max === undefined ? "" : `at most ${number(measure.max)}`
}

const section = (title: string, lines: readonly string[]) =>
  lines.length === 0 ? [] : [`## ${title} (${lines.length})`, "", ...lines, ""]

export function scoreReport(input: {
  runId: string
  split: string
  promptVersions: Readonly<Record<string, number>>
  encodingCost: number
  /** Whether the run folder had the coding agent's pairs.json. */
  hasAgentPairs: boolean
  scores: RunScores
}) {
  const { measures, details } = input.scores
  const { rules, coverage, terms, validity, structure } = details
  const byKey = rules.pairs.filter((pair) => pair.by === "key").length
  const passed = measures.filter((measure) => measure.passed).length
  return [
    `# Encoding scores ${input.runId}`,
    "",
    `Split ${input.split}. Prompts: ${Object.entries(input.promptVersions)
      .map(([name, version]) => `${name} v${version}`)
      .join(", ")}. Encoding cost $${input.encodingCost.toFixed(2)}.`,
    `Counts: ${rules.counts.reference} golden rules, ${rules.counts.pipeline} pipeline rules, ${rules.pairs.length} pairs (${byKey} by key, ${rules.pairs.length - byKey} from pairs.json), ${details.checks.filter((check) => check.isComparable).length} of ${details.checks.length} pairs the engine evaluates comparable, ${terms.terms} golden terms (${terms.byAgent} matched from pairs.json), ${validity.units} units.`,
    "",
    `${passed} of ${measures.length} bars computed by code cleared. Rule recall, rule precision and pairwise quality are judged by the coding agent from compare/${input.hasAgentPairs ? "" : "; no pairs.json yet, so modality and check agreement cover only rules paired by key"}.`,
    "",
    "| Measure | Value | Bar | Passed |",
    "| --- | --- | --- | --- |",
    ...measures.map(
      (measure) =>
        `| ${measure.label} | ${number(measure.value)} | ${barText(measure)} | ${measure.passed ? "yes" : "no"} |`
    ),
    "",
    ...section(
      "Golden rules without a pair",
      rules.unpairedReference.map((key) => `- ${key}`)
    ),
    ...section(
      "Pipeline rules without a pair",
      rules.unpairedPipeline.map((key) => `- ${key}`)
    ),
    ...section(
      "Modality disagreements",
      details.modalityMisses.map((miss) => `- ${miss.reference} (${miss.golden}) / ${miss.pipeline} (${miss.ours})`)
    ),
    ...section(
      "Check disagreements",
      details.checks
        .filter((check) => check.isComparable && check.agreeing < check.cases)
        .map(
          (check) =>
            `- ${check.reference} / ${check.pipeline}: ${check.agreeing} of ${check.cases} agree; e.g. ${check.examples
              .map((example) => `${example.reference} vs ${example.pipeline}`)
              .join(", ")}`
        )
    ),
    ...section(
      "Paired rules whose reads don't translate into the other vocabulary",
      details.checks.filter((check) => !check.isComparable).map((check) => `- ${check.reference} / ${check.pipeline}`)
    ),
    ...section(
      "No-rule reasons differing from the golden",
      coverage.disagreements.map((item) => `- ${item.key}: golden ${item.golden}, pipeline ${item.pipeline ?? "rules"}`)
    ),
    ...section(
      "Uncovered provisions",
      coverage.uncovered.map((key) => `- ${key}`)
    ),
    ...section(
      "Golden terms without a pipeline term",
      terms.missing.map((key) => `- ${key}`)
    ),
    ...section(
      "Units invalid after repair",
      validity.invalid.map((id) => `- ${id}`)
    ),
    ...section(
      "Units repaired",
      validity.repairedUnits.map((id) => `- ${id}`)
    ),
    ...section(
      "Golden provision keys not found",
      structure.missing.map((key) => `- ${key}`)
    ),
    ...section(
      "Provision keys not in the golden",
      structure.extra.map((key) => `- ${key}`)
    )
  ].join("\n")
}
