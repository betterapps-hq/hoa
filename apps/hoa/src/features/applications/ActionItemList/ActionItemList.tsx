import { ChevronDownIcon } from "lucide-react"
import { useId } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ActionItem } from "@/review/reviewModel"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import type { Finding } from "@/schema/types"
import { shownItems, stepGroupId, stepOutcomes, type StepGroup } from "../NextSteps/NextSteps.utils"
import { outcomeIcons } from "../OutcomeChip/OutcomeChip"
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
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3">
      <dt className="text-muted-foreground">Rule</dt>
      <dd>
        <ReviewRuleReference ruleKey={item.ruleKey} context={context} />
      </dd>
      {findings.length > 0 ? (
        <>
          <dt className="text-muted-foreground">Read for</dt>
          <dd className="flex flex-wrap gap-x-3 gap-y-1">
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
          </dd>
        </>
      ) : null}
    </dl>
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
 * One group of next steps as a card: what it asks, how many, then each item in a row, with its rule and the evidence
 * behind it on demand. Long groups show the first few.
 */
export function ActionItemList({ group, context, isExpanded, onExpandedChange, onOpenFinding }: ActionItemListProps) {
  const headingId = useId()
  const shown = shownItems(group, isExpanded)
  const collapsible = group.items.length - shownItems(group, false).length
  const title = (ruleKey: string) => context.rules.get(ruleKey)?.title ?? ruleKey
  const { icon: Icon, className } = outcomeIcons[stepOutcomes[group.key]]
  return (
    <section
      id={stepGroupId(group.key)}
      aria-labelledby={headingId}
      className="scroll-mt-4 overflow-hidden rounded-xl border bg-card text-sm shadow-xs"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className={cn("size-4", className)} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 id={headingId} className="font-medium">
            {group.title}
          </h3>
          {group.key === "suggestions" ? (
            <p className="text-xs text-muted-foreground">These don’t affect the recommendation.</p>
          ) : null}
        </div>
        <Badge variant="secondary" className="tabular-nums" aria-hidden>
          {group.items.length}
        </Badge>
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col divide-y border-t">
          {shown.map((item) => (
            <li key={item.id}>
              <Collapsible>
                <CollapsibleTrigger
                  id={actionItemId(item)}
                  className="group/step flex w-full items-start justify-between gap-4 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <span className="text-pretty">{renderRuleMarkers(item.text, title)}</span>
                  <ChevronDownIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/step:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-3">
                  <ItemDetail group={group} item={item} context={context} onOpenFinding={onOpenFinding} />
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      ) : null}
      {collapsible > 0 ? (
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            aria-expanded={isExpanded}
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {moreLabel(group, collapsible, isExpanded)}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
