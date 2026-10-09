import { z } from "zod"
import type { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptVariables } from "@/ai/prompts"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type { ReviewResult } from "@/review/run"
import { selectedRulesFile } from "@/review/select"
import { summaryVariables } from "@/review/write"
import type * as T from "@/schema/types"

// The writer's judge (implementation-plan.md, Evaluation round 2: writer faithfulness and clarity). One
// hoa-eval-review-judge call per review reads what the writer read (the recommendation, the findings with their rules
// and cited provisions, the action items) with the writer's phrasing of each item, its assessment and its feedback,
// and says of each part whether it's faithful and clear. The score is the share of parts that are both.

export const reviewJudgeAnswer = z.object({
  parts: z
    .array(
      z.object({
        part: z.string().describe('"assessment", "feedback", or an action item\'s id.'),
        faithful: z
          .boolean()
          .describe(
            "Says only what the findings and action items support: no requirement, fact or outcome they don't hold, and nothing they hold misstated."
          ),
        clear: z.boolean().describe("A homeowner or committee member could act on it without asking what it means."),
        reason: z.string()
      })
    )
    .describe("One entry for the assessment, one for the feedback and one for every action item.")
})
export type ReviewJudgeAnswer = z.infer<typeof reviewJudgeAnswer>

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

/** The judge's variables: the writer's own, with each action item as the writer phrased it, and its writing. */
export function reviewJudgeVariables(
  result: Written,
  rulesFile: T.RulesFile,
  vocabulary: EngineVocabulary
): PromptVariables<typeof pipelinePrompts.reviewJudge> {
  const reviewed = selectedRulesFile(rulesFile, result.selected)
  const written = summaryVariables(
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
      vocabulary
    }
  )
  return { ...written, writing: JSON.stringify({ assessment: result.assessment, feedback: result.feedback }) }
}

/** The share of the parts the judge found both faithful and clear; null when it judged none. */
export function writerScore(answer: ReviewJudgeAnswer) {
  const { parts } = answer
  return parts.length === 0 ? null : parts.filter((part) => part.faithful && part.clear).length / parts.length
}
