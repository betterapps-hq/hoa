import { ChevronDownIcon } from "lucide-react"
import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ActionItem } from "@/review/reviewModel"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import type { Finding } from "@/schema/types"
import { shownItems, type StepGroup } from "../NextSteps/NextSteps.utils"
import { actionItemId, entityLabel, itemFindings, type ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"

export type ActionItemListProps = {
  group: StepGroup
  context: ReviewContext
  /** Whether every item shows, past the first few. */
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  /** Opens a finding the item gathers, with what the review read for it. */
  onOpenFinding: (finding: Finding) => void
}

type ItemDetailProps = Omit<ActionItemListProps, "isExpanded" | "onExpandedChange"> & { item: ActionItem }

/** An item on demand: its rule and citation, and the parts it covers, each opening what the review read. */
function ItemDetail({ group, item, context, onOpenFinding }: ItemDetailProps) {
  const findings = itemFindings(context.review, group.key, item)
  return (
    <div className="flex flex-col gap-2 text-muted-foreground">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span>Rule</span>
        <span className="text-foreground">
          <ReviewRuleReference ruleKey={item.ruleKey} context={context} />
        </span>
      </div>
      {findings.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span>What the review read for</span>
          <span className="inline-flex flex-wrap gap-x-3">
            {findings.map((finding) => (
              <Button
                key={finding.entity}
                variant="link"
                className="h-auto p-0 text-left whitespace-normal text-link"
                aria-label={`What the review read for ${entityLabel(context, finding.entity)}`}
                onClick={() => onOpenFinding(finding)}
              >
                {entityLabel(context, finding.entity)}
              </Button>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** "Show 3 more", or for suggestions, which start hidden, "Show 2 suggestions". */
function moreLabel(group: StepGroup, hidden: number, isExpanded: boolean) {
  if (group.key !== "suggestions") {
    return isExpanded ? "Show fewer" : `Show ${hidden} more`
  }
  if (isExpanded) {
    return "Hide suggestions"
  }
  return hidden === 1 ? "Show 1 suggestion" : `Show ${hidden} suggestions`
}

/**
 * One group of next steps: each item in a line, with its rule and the evidence behind it on demand. Long groups show
 * the first few.
 */
export function ActionItemList({ group, context, isExpanded, onExpandedChange, onOpenFinding }: ActionItemListProps) {
  const headingId = useId()
  const shown = shownItems(group, isExpanded)
  const collapsible = group.items.length - shownItems(group, false).length
  const title = (ruleKey: string) => context.rules.get(ruleKey)?.title ?? ruleKey
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <h3 id={headingId} className="text-sm font-medium">
          {group.title}
        </h3>
        <span className="text-sm text-muted-foreground" aria-hidden>
          {group.items.length}
        </span>
      </div>
      {group.key === "suggestions" ? (
        <p className="text-sm text-muted-foreground">These don’t affect the recommendation.</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="flex flex-col">
          {shown.map((item) => (
            <li key={item.id} className="border-b last:border-b-0">
              <Collapsible>
                <CollapsibleTrigger
                  id={actionItemId(item)}
                  className="group/step -mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-4 rounded-md px-2 py-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span>{renderRuleMarkers(item.text, title)}</span>
                  <ChevronDownIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/step:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pb-3 text-sm">
                  <ItemDetail group={group} item={item} context={context} onOpenFinding={onOpenFinding} />
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      ) : null}
      {collapsible > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 self-start text-muted-foreground"
          aria-expanded={isExpanded}
          onClick={() => onExpandedChange(!isExpanded)}
        >
          {moreLabel(group, collapsible, isExpanded)}
        </Button>
      ) : null}
    </section>
  )
}
