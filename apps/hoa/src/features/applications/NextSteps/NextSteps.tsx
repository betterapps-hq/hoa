import { CircleCheckIcon } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Finding } from "@/schema/types"
import { ActionItemList } from "../ActionItemList/ActionItemList"
import type { ReviewContext } from "../reviewContext"
import { stepGroups, type StepKey } from "./NextSteps.utils"

export type NextStepsProps = {
  context: ReviewContext
  /** The groups showing every item. */
  expanded: ReadonlySet<StepKey>
  onExpandedChange: (key: StepKey, isExpanded: boolean) => void
  onOpenFinding: (finding: Finding) => void
}

/** The review's action items, grouped and ordered by what changes the outcome, each one line. */
export function NextSteps({ context, expanded, onExpandedChange, onOpenFinding }: NextStepsProps) {
  const groups = stepGroups(context.review, context.audience)
  if (groups.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing to change or add.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <ActionItemList
          key={group.key}
          group={group}
          context={context}
          isExpanded={expanded.has(group.key)}
          onExpandedChange={(isExpanded) => onExpandedChange(group.key, isExpanded)}
          onOpenFinding={onOpenFinding}
        />
      ))}
    </div>
  )
}
