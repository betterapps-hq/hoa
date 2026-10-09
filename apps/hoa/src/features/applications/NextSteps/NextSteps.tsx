import { useId } from "react"
import type { Finding } from "@/schema/types"
import { ActionItemList } from "../ActionItemList/ActionItemList"
import type { ReviewContext } from "../reviewContext"
import { stepGroups, type StepKey } from "./NextSteps.utils"

export type NextStepsProps = {
  context: ReviewContext
  /** The section's heading; null when a disclosure already names it. */
  heading: string | null
  /** The groups showing every item. */
  expanded: ReadonlySet<StepKey>
  onExpandedChange: (key: StepKey, isExpanded: boolean) => void
  onOpenFinding: (finding: Finding) => void
}

/** The review's action items, grouped and ordered by what changes the outcome, each one line. */
export function NextSteps({ context, heading, expanded, onExpandedChange, onOpenFinding }: NextStepsProps) {
  const headingId = useId()
  const groups = stepGroups(context.review, context.audience)
  return (
    <section aria-labelledby={heading ? headingId : undefined} className="flex flex-col gap-6">
      {heading ? (
        <h2 id={headingId} className="text-lg font-semibold">
          {heading}
        </h2>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to change or add.</p>
      ) : (
        groups.map((group) => (
          <ActionItemList
            key={group.key}
            group={group}
            context={context}
            isExpanded={expanded.has(group.key)}
            onExpandedChange={(isExpanded) => onExpandedChange(group.key, isExpanded)}
            onOpenFinding={onOpenFinding}
          />
        ))
      )}
    </section>
  )
}
