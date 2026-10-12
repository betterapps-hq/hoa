import type { RulebookRecords } from "@/rulebook/assemble"
import type { Coverage } from "@/rulebook/coverage"
import { isBlocking } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { WorkspaceView } from "../RulebookWorkspace/RulebookWorkspace.utils"

// What's left before a draft can be published (encoding.md, UX, Draft review): a short to-do list, in the order the
// work goes, each item leading to where it's done.

export type DraftTodo = {
  id: "terms" | "questions" | "rules" | "settings" | "reasons" | "uncovered" | "problems"
  /** The headline when it's next: "3 questions need your answer". */
  sentence: string
  /** The button that does it next: "Answer questions". */
  action: string
  /** The item in the list: "Answer 3 questions". */
  label: string
  view: Omit<WorkspaceView, "request">
}

const isProposed = (record: { review: T.Review }) => record.review.status === "proposed"
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/**
 * The draft's to-do list: terms first (a rule waits for the terms it reads), then questions (an answer approves the
 * rules it keeps), rules, settings, reasons for having no rule, provisions nothing covers, and approved rules with open
 * problems.
 */
export function draftTodos(records: RulebookRecords, coverage: Pick<Coverage, "uncovered">): DraftTodo[] {
  const terms = records.terms.filter(isProposed).length
  const questions = records.questions.filter((question) => question.answer === null).length
  const rules = records.rules.filter(isProposed).length
  const reasons = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed").length
  const uncovered = coverage.uncovered.length
  const problems = records.rules.filter(
    (rule) =>
      rule.review.status === "approved" &&
      rule.issues.some((issue) => issue.resolution === null && isBlocking(issue.code))
  ).length
  const todos: (DraftTodo | null)[] = [
    terms > 0
      ? {
          id: "terms",
          sentence: `${terms} ${plural(terms, "term needs", "terms need")} your review`,
          action: "Review terms",
          label: `Review ${terms} ${plural(terms, "term", "terms")}`,
          view: { tab: "terms", filter: "proposed" }
        }
      : null,
    questions > 0
      ? {
          id: "questions",
          sentence: `${questions} ${plural(questions, "question needs", "questions need")} your answer`,
          action: "Answer questions",
          label: `Answer ${questions} ${plural(questions, "question", "questions")}`,
          view: { tab: "questions", filter: null }
        }
      : null,
    rules > 0
      ? {
          id: "rules",
          sentence: `${rules} ${plural(rules, "rule needs", "rules need")} your review`,
          action: "Review rules",
          label: `Review ${rules} ${plural(rules, "rule", "rules")}`,
          view: { tab: "rules", filter: "proposed" }
        }
      : null,
    isProposed(records.settings)
      ? {
          id: "settings",
          sentence: "The settings need your review",
          action: "Review the settings",
          label: "Review the settings",
          view: { tab: "settings", filter: null }
        }
      : null,
    reasons > 0
      ? {
          id: "reasons",
          sentence: `${reasons} ${plural(reasons, "reason", "reasons")} for having no rule ${plural(reasons, "needs", "need")} your review`,
          action: "Review reasons",
          label: `Review ${reasons} ${plural(reasons, "reason", "reasons")} for having no rule`,
          view: { tab: "coverage", filter: "to-review" }
        }
      : null,
    uncovered > 0
      ? {
          id: "uncovered",
          sentence: `${uncovered} ${plural(uncovered, "provision has", "provisions have")} no rule and no reason`,
          action: "Review coverage",
          label: `Cover ${uncovered} ${plural(uncovered, "provision", "provisions")} with a rule or a reason`,
          view: { tab: "coverage", filter: "uncovered" }
        }
      : null,
    problems > 0
      ? {
          id: "problems",
          sentence: `${problems} approved ${plural(problems, "rule has", "rules have")} problems to fix`,
          action: "Fix problems",
          label: `Fix the problems on ${problems} approved ${plural(problems, "rule", "rules")}`,
          view: { tab: "rules", filter: "problems" }
        }
      : null
  ]
  return todos.filter((todo) => todo !== null)
}
