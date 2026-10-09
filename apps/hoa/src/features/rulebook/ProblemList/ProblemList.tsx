import { CircleAlertIcon, InfoIcon } from "lucide-react"
import type { Problem } from "../ruleProblems"

export type ProblemListProps = { problems: Problem[] }

/** Problems with an edit, each with where it is; those that block approval first. */
export function ProblemList({ problems }: ProblemListProps) {
  if (problems.length === 0) {
    return <p className="text-sm text-muted-foreground">No problems found.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Problems">
      {problems
        .toSorted((a, b) => Number(b.isBlocking) - Number(a.isBlocking))
        .map((problem) => (
          <li key={`${problem.path} ${problem.message}`} className="flex items-start gap-2 text-sm">
            {problem.isBlocking ? (
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span>
              <span className="sr-only">{problem.isBlocking ? "Blocks approval: " : "Note: "}</span>
              {problem.message}
              {problem.path ? (
                <span className="ml-1 font-mono text-xs text-muted-foreground">{problem.path}</span>
              ) : null}
            </span>
          </li>
        ))}
    </ul>
  )
}
