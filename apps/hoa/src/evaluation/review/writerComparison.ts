import type { EngineVocabulary } from "@/engine/vocabulary"
import type { ReviewResult } from "@/review/run"
import { selectedRulesFile } from "@/review/select"
import { summaryVariables } from "@/review/write"
import type * as T from "@/schema/types"
import type { ReviewScores } from "./score"

// The writer's comparison file (writer.md in each case's folder), which the coding agent judges the writer's
// faithfulness and clarity from (evaluation.md, Judging by the coding agent): what the writer read (the recommendation,
// the findings with their rules and cited provisions, the action items with the writer's phrasing, the suggestions)
// beside what it wrote (the assessment and the feedback), with the case's scores from code. No model reads it. It may
// quote the packet, so it stays in the git-ignored run folder.

type Written = Pick<
  ReviewResult,
  | "request"
  | "selected"
  | "findings"
  | "recommendation"
  | "changes"
  | "missingInformation"
  | "committeeDecisions"
  | "suggestions"
  | "assessment"
  | "feedback"
>

const pretty = (json: string) => (json === "none" ? "none" : JSON.stringify(JSON.parse(json), null, 2))

const block = (title: string, text: string, language = "json") => [
  `## ${title}`,
  "",
  `\`\`\`${language}`,
  text,
  "```",
  ""
]

export function writerComparison(
  caseId: string,
  result: Written,
  context: { rulesFile: T.RulesFile; vocabulary: EngineVocabulary; scores: ReviewScores }
) {
  const reviewed = selectedRulesFile(context.rulesFile, result.selected)
  const read = summaryVariables(
    reviewed,
    result.recommendation,
    {
      changes: result.changes,
      missingInformation: result.missingInformation,
      committeeDecisions: result.committeeDecisions,
      suggestions: result.suggestions
    },
    {
      rules: new Map(reviewed.rules.map((rule) => [rule.key, rule])),
      entities: result.request.entities,
      findings: result.findings,
      vocabulary: context.vocabulary
    }
  )
  const scores = Object.entries(context.scores)
    .map(([name, value]) => `${name} ${value === null ? "-" : value.toFixed(2)}`)
    .join(", ")
  return [
    `# Writer of ${caseId}`,
    "",
    "Judged by the coding agent (apps/hoa/docs/design/evaluation.md, Judging by the coding agent): is each part of the writing faithful to what the writer read, and clear enough to act on?",
    "",
    `Scores from code: ${scores}.`,
    "",
    `Recommendation: ${read.recommendation}.`,
    "",
    ...block("What the writer read: findings", pretty(read.findings)),
    ...block("What the writer read: action items, as the writer phrased them", pretty(read.actionItems)),
    ...block("What the writer read: suggestions", pretty(read.suggestions)),
    ...block("What the writer wrote: assessment", result.assessment, "text"),
    ...block("What the writer wrote: feedback", result.feedback, "text")
  ].join("\n")
}
