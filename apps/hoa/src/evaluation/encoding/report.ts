import type { Measure, RunScores } from "./score"

// A run's scores as Markdown (report.md in the run's folder): the bar table, then what's behind every miss, by key.
// It holds the judge's reasons, which may quote the documents, so it stays in the git-ignored run folder.

const number = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(3))

function barText(measure: Measure) {
  if (measure.min !== undefined) {
    return `at least ${number(measure.min)}`
  }
  return measure.max === undefined ? "" : `at most ${number(measure.max)}`
}

const section = (title: string, lines: readonly string[]) =>
  lines.length === 0 ? [] : [`## ${title} (${lines.length})`, "", ...lines, ""]

const clip = (text: string, length = 300) => (text.length > length ? `${text.slice(0, length)}…` : text)

export function scoreReport(input: {
  runId: string
  split: string
  promptVersions: Readonly<Record<string, number>>
  judgeVersion: number
  cost: { encoding: number; judge: number }
  scores: RunScores
}) {
  const { measures, details } = input.scores
  const { judge, coverage, terms, validity, structure } = details
  const passed = measures.filter((measure) => measure.passed).length
  return [
    `# Encoding scores ${input.runId}`,
    "",
    `Split ${input.split}. Prompts: ${Object.entries(input.promptVersions)
      .map(([name, version]) => `${name} v${version}`)
      .join(", ")}; judge hoa-eval-encoding-judge v${input.judgeVersion}.`,
    `Cost: encoding $${input.cost.encoding.toFixed(2)}, judging $${input.cost.judge.toFixed(2)}.`,
    `Counts: ${judge.counts.references} golden rules, ${judge.counts.judgedRules} pipeline rules judged, ${judge.counts.provisions} provisions judged, ${judge.pairs.length} pairs, ${details.checks.filter((check) => check.isComparable).length} of ${details.checks.length} pairs the engine evaluates comparable, ${terms.terms} golden terms (${terms.byJudge} matched by the term judge), ${validity.units} units.`,
    "",
    `${passed} of ${measures.length} bars cleared.`,
    "",
    "| Measure | Value | Bar | Passed |",
    "| --- | --- | --- | --- |",
    ...measures.map(
      (measure) =>
        `| ${measure.label} | ${number(measure.value)} | ${barText(measure)} | ${measure.passed ? "yes" : "no"} |`
    ),
    "",
    ...section(
      "Golden rules without a pipeline rule",
      judge.misses.map((miss) => `- ${miss.key}: ${clip(miss.note)}`)
    ),
    ...section(
      "Pipeline rules not faithful to the text",
      judge.unfaithful.map((rule) => `- ${rule.key}: ${clip(rule.reason)}`)
    ),
    ...section(
      "Pipeline rules the judge left out",
      judge.unjudged.map((key) => `- ${key}`)
    ),
    ...section(
      "Provisions encoded worse than the golden",
      judge.worse.map((provision) => `- ${provision.provisionKey}: ${clip(provision.reason)}`)
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
