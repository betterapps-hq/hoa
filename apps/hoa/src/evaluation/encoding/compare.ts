import { provisionBlock } from "@/encoding/promptVariables"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import { describeRule } from "@/schema/describe"
import type { Provision, ProvisionKey, Rule } from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"
import type { CheckAgreement } from "./checkAgreement"
import type { RunScores } from "./score"
import type { UnmatchedTermGroup } from "./terms"

// The comparison files the coding agent judges a run from (evaluation.md, Judging by the coding agent), written to the
// run folder's compare/: for each provision that is the main citation of a rule on either side, its text, the golden
// and pipeline rules side by side, and what code found about them; the golden terms nothing matches, with the pipeline
// terms they may be; and an index. No model reads them. They quote the documents, so they stay in the git-ignored run
// folder.

const judgingDoc = "apps/hoa/docs/design/evaluation.md, Judging by the coding agent"

/** The rules whose main citation is one provision, on each side. */
export type ProvisionGroup = { provisionKey: ProvisionKey; reference: Rule[]; pipeline: Rule[] }

const mainCitation = (rule: Rule) => rule.citations[0]?.provisionKey ?? ""

/** Groups both sides' rules by main citation, in key order. */
export function provisionGroups(reference: readonly Rule[], pipeline: readonly Rule[]): ProvisionGroup[] {
  const groups = new Map<ProvisionKey, ProvisionGroup>()
  const groupOf = (provisionKey: ProvisionKey) => {
    const found = groups.get(provisionKey) ?? { provisionKey, reference: [], pipeline: [] }
    groups.set(provisionKey, found)
    return found
  }
  reference.forEach((rule) => groupOf(mainCitation(rule)).reference.push(rule))
  pipeline.forEach((rule) => groupOf(mainCitation(rule)).pipeline.push(rule))
  return [...groups.values()].toSorted((a, b) => compareCodeUnits(a.provisionKey, b.provisionKey))
}

/** A provision's comparison file, under compare/rules/: its key with the characters a path can't hold replaced. */
export const comparisonFileName = (provisionKey: ProvisionKey) =>
  `rules/${provisionKey.replaceAll(/[:/\\#*?"<>|]/g, "~") || "no-citation"}.md`

/** A rule as the agent reads it: key, sentence and JSON without bookkeeping. */
function ruleText(rule: Rule, vocabulary: Vocabulary) {
  const { provenance: _provenance, review: _review, issues: _issues, effectiveFrom: _effectiveFrom, ...content } = rule
  return [`### ${rule.key}`, "", describeRule(rule, vocabulary), "", "```json", canonicalJson(content), "```"].join(
    "\n"
  )
}

/** The lead-ins and wrap-ups of a provision's ancestors, outermost first. */
function ancestorsText(provision: Provision, byKey: ReadonlyMap<ProvisionKey, Provision>) {
  const documentKey = provision.key.slice(0, provision.key.indexOf(":"))
  const lines: string[] = []
  const seen = new Set<string>()
  for (
    let parent = provision.parentLabel ? byKey.get(`${documentKey}:${provision.parentLabel}`) : undefined;
    parent && !seen.has(parent.key);
    parent = parent.parentLabel ? byKey.get(`${documentKey}:${parent.parentLabel}`) : undefined
  ) {
    seen.add(parent.key)
    const parts = [parent.intro ? `intro: ${parent.intro}` : "", parent.wrapUp ? `wrap-up: ${parent.wrapUp}` : ""]
    lines.unshift([`[${parent.key}]${parent.heading ? ` ${parent.heading}` : ""}`, ...parts.filter(Boolean)].join("\n"))
  }
  return lines
}

/** The main provision with its ancestors' lead-ins, then the other provisions the group's rules cite. */
function provisionText(group: ProvisionGroup, provisions: ReadonlyMap<ProvisionKey, Provision>) {
  const main = provisions.get(group.provisionKey)
  const cited = new Set(
    [...group.reference, ...group.pipeline].flatMap((rule) => rule.citations.map((citation) => citation.provisionKey))
  )
  cited.delete(group.provisionKey)
  const others = [...cited].toSorted(compareCodeUnits).flatMap((key) => {
    const found = provisions.get(key)
    return found ? [`Also cited:\n${provisionBlock(found)}`] : []
  })
  return main
    ? [...ancestorsText(main, provisions), provisionBlock(main), ...others].join("\n\n")
    : [`[${group.provisionKey}] (not found)`, ...others].join("\n\n")
}

type CodeFindings = Pick<RunScores["details"], "rules" | "modalityMisses" | "checks">

/** What the engine found evaluating a pair's rules on generated subjects. */
function checkText(check: CheckAgreement | undefined) {
  if (!check) {
    return "the engine evaluates neither rule on its own"
  }
  if (!check.isComparable) {
    return "the reads don't translate into the other vocabulary"
  }
  const examples = check.examples.map((example) => `${example.reference} vs ${example.pipeline}`).join(", ")
  return `checks agree in ${check.agreeing} of ${check.cases} generated cases${examples ? ` (e.g. ${examples})` : ""}`
}

/** What code found about a group's rules: pairs with their modality and check agreement, and the rules left unpaired. */
function findingsText(group: ProvisionGroup, details: CodeFindings) {
  const references = new Set(group.reference.map((rule) => rule.key))
  const unpairedPipeline = new Set(details.rules.unpairedPipeline)
  const pairLines = details.rules.pairs
    .filter((pair) => references.has(pair.reference))
    .map((pair) => {
      const miss = details.modalityMisses.find(
        (item) => item.reference === pair.reference && item.pipeline === pair.pipeline
      )
      const check = details.checks.find((item) => item.reference === pair.reference && item.pipeline === pair.pipeline)
      return `- ${pair.reference} = ${pair.pipeline} (${pair.by === "key" ? "same key" : "pairs.json"}); ${miss ? `modality differs: golden ${miss.golden}, pipeline ${miss.ours}` : "same modality"}; ${checkText(check)}`
    })
  const unpaired = (keys: readonly string[]) => (keys.length === 0 ? ["- none"] : keys.map((key) => `- ${key}`))
  return [
    "Pairs:",
    "",
    ...(pairLines.length === 0 ? ["- none"] : pairLines),
    "",
    "Golden rules without a pair:",
    "",
    ...unpaired(group.reference.map((rule) => rule.key).filter((key) => details.rules.unpairedReference.includes(key))),
    "",
    "Pipeline rules without a pair:",
    "",
    ...unpaired(group.pipeline.map((rule) => rule.key).filter((key) => unpairedPipeline.has(key)))
  ].join("\n")
}

/** One provision's comparison: the text, both sides' rules and what code found. */
export function ruleComparison(
  group: ProvisionGroup,
  context: {
    provisions: ReadonlyMap<ProvisionKey, Provision>
    vocabularies: { reference: Vocabulary; pipeline: Vocabulary }
    details: CodeFindings
  }
) {
  const rules = (rules: readonly Rule[], vocabulary: Vocabulary) =>
    rules.length === 0 ? ["None."] : rules.map((rule) => ruleText(rule, vocabulary))
  return [
    `# ${group.provisionKey || "Rules without a citation"}`,
    "",
    `Judged by the coding agent (${judgingDoc}).`,
    "",
    "## Text",
    "",
    "```text",
    provisionText(group, context.provisions),
    "```",
    "",
    `## Golden rules (${group.reference.length})`,
    "",
    ...rules(group.reference, context.vocabularies.reference),
    "",
    `## Pipeline rules (${group.pipeline.length})`,
    "",
    ...rules(group.pipeline, context.vocabularies.pipeline),
    "",
    "## What code found",
    "",
    findingsText(group, context.details),
    ""
  ].join("\n")
}

/** A term as the agent reads it: its key, then its content without bookkeeping. */
function termText(term: TermContent) {
  const { key, organizationId: _organizationId, ...content } = term
  return `- \`${key}\` ${canonicalJson(content)}`
}

/** The golden terms nothing matches, each group with the pipeline terms it may be, then those with no candidate. */
export function termComparison(groups: readonly UnmatchedTermGroup[], missing: readonly string[]) {
  const offered = new Set(groups.flatMap((group) => group.reference.map((term) => term.key)))
  const alone = missing.filter((key) => !offered.has(key))
  return [
    "# Terms without a match",
    "",
    `Golden terms on the run's split that no key, label or pairs.json pair matches, with the unmatched pipeline terms of the same kind (under the aligned parent) they may be. Judged by the coding agent (${judgingDoc}).`,
    "",
    ...groups.flatMap((group) => [
      group.parent
        ? `## ${group.kind} terms of ${group.parent.golden} (pipeline ${group.parent.pipeline})`
        : `## ${group.kind} terms`,
      "",
      "Golden:",
      "",
      ...group.reference.map(termText),
      "",
      "Pipeline candidates:",
      "",
      ...group.pipeline.map(termText),
      ""
    ]),
    `## Golden terms with no candidate (${alone.length})`,
    "",
    "A property, category or value here may get candidates once its parent is paired.",
    "",
    ...(alone.length === 0 ? ["- none"] : alone.map((key) => `- ${key}`)),
    ""
  ].join("\n")
}

/** The index: every provision's file with its counts, and the terms file. */
export function comparisonIndex(runId: string, groups: readonly ProvisionGroup[], details: CodeFindings) {
  const paired = new Set(details.rules.pairs.map((pair) => pair.reference))
  const unpairedPipeline = new Set(details.rules.unpairedPipeline)
  return [
    `# Comparison of run ${runId}`,
    "",
    `For the coding agent to judge rule recall, rule precision, pairwise quality and the unmatched terms (${judgingDoc}). The scores code computes are in ../report.md.`,
    "",
    "| Provision | Golden rules | Pipeline rules | Golden paired | Pipeline unpaired |",
    "| --- | --- | --- | --- | --- |",
    ...groups.map(
      (group) =>
        `| [${group.provisionKey || "no citation"}](<${comparisonFileName(group.provisionKey)}>) | ${group.reference.length} | ${group.pipeline.length} | ${group.reference.filter((rule) => paired.has(rule.key)).length} | ${group.pipeline.filter((rule) => unpairedPipeline.has(rule.key)).length} |`
    ),
    "",
    "Terms: [terms.md](terms.md).",
    ""
  ].join("\n")
}
