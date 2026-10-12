import { ListChecksIcon, type LucideIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import type { Application } from "@/applications/application"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { ActionItem } from "@/review/reviewModel"
import type { Finding } from "@/schema/types"
import { outcomeLabels } from "../applicationDisplay"
import { FindingSheet } from "../FindingSheet/FindingSheet"
import { MarkedText } from "../MarkedText/MarkedText"
import { NextSteps } from "../NextSteps/NextSteps"
import { stepCountTitle, stepGroupId, stepGroups, stepOutcomes, type StepKey } from "../NextSteps/NextSteps.utils"
import { outcomeIcons } from "../OutcomeChip/OutcomeChip"
import { PacketFacts, packetFacts } from "../PacketFacts/PacketFacts"
import { actionItemId, type ReviewContext } from "../reviewContext"
import { ReviewMatrix } from "../ReviewMatrix/ReviewMatrix"
import { ReviewVerdict } from "../ReviewVerdict/ReviewVerdict"
import {
  decisionTones,
  recommendationTones,
  ruleCounts,
  verdictHeadline,
  verdictReason
} from "../ReviewVerdict/ReviewVerdict.utils"

/** A tab of the report: the review's own, or one the page adds, such as the packet's files. */
export type ReportTab = { value: string; label: string; count?: number; content: ReactNode }

export type ReviewReportProps = {
  context: ReviewContext
  /** The committee's decision; once made, it takes the recommendation's place at the top. */
  decision: Application["decision"]
  /** More tabs from the page, after the review's own. */
  tabs?: readonly ReportTab[]
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** When the review ran, and on demand, what a provisional review means. */
function ReviewDate({ context }: { context: ReviewContext }) {
  const { review } = context
  const date = dateFormat.format(new Date(review.createdAt))
  if (!review.provisional) {
    return <p className="text-sm text-muted-foreground">Reviewed {date}</p>
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
      <span>Provisional review from {date}</span>
      <Popover>
        <PopoverTrigger render={<Button variant="link" className="h-auto p-0 text-sm text-link" />}>
          What this means
        </PopoverTrigger>
        <PopoverContent className="text-sm">
          This review ran before the application was submitted, so it checked it against the rules in force that day.
          The decision goes by the rules in force on the date of submission.
        </PopoverContent>
      </Popover>
    </p>
  )
}

/** The groups the counts show: those that change the outcome. */
const countedSteps: readonly StepKey[] = ["missingInformation", "changes", "committeeDecisions"]

type Count = { key: string; label: string; icon: LucideIcon; className: string; value: ReactNode; onOpen?: () => void }

/** The review in numbers: what each group of next steps holds, and the rules met; each opens what it counts. */
function Counts({ counts }: { counts: readonly Count[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="The review in numbers">
      {counts.map(({ key, label, icon: Icon, className, value, onOpen }) => {
        const content = (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />
              {label}
            </span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          </>
        )
        const tile =
          "flex h-full w-full flex-col items-start justify-between gap-1 rounded-lg border px-3 py-2.5 text-left"
        return (
          <li key={key}>
            {onOpen ? (
              <button
                type="button"
                className={cn(
                  tile,
                  "outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                )}
                onClick={onOpen}
              >
                {content}
              </button>
            ) : (
              <div className={tile}>{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A review as the application page shows it: the recommendation with one sentence of why and the counts it rests on,
 * then tabs: the next steps first, in the order that changes the outcome, then how each rule was checked, what the
 * review read, its written summary, and whatever the page adds.
 */
export function ReviewReport({ context, decision, tabs = [] }: ReviewReportProps) {
  const { review, audience } = context
  const [tab, setTab] = useState("overview")
  const [selected, setSelected] = useState<Finding | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<StepKey>>(new Set())
  const facts = packetFacts(review)
  const rules = ruleCounts(review)

  const openFinding = (finding: Finding) => {
    setSelected(finding)
    setIsSheetOpen(true)
  }
  const setGroupExpanded = (key: StepKey, isExpanded: boolean) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (isExpanded) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  /** Shows the overview, then runs once it's on the page. */
  const toOverview = (then: () => void) => {
    setTab("overview")
    requestAnimationFrame(then)
  }
  const showActionItem = (item: ActionItem) => {
    const group = stepGroups(review, audience).find((found) => found.items.includes(item))
    if (group) {
      setGroupExpanded(group.key, true)
    }
    setIsSheetOpen(false)
    // After the sheet gives focus back, move it to the action item.
    toOverview(() => {
      const element = document.getElementById(actionItemId(item))
      element?.scrollIntoView({ block: "center" })
      element?.focus()
      // A focus from a click shows no ring, so the item is briefly marked instead.
      element?.animate?.([{ backgroundColor: "var(--muted)" }, { backgroundColor: "transparent" }], {
        duration: 1600,
        easing: "ease-out"
      })
    })
  }

  const counts: Count[] = [
    ...countedSteps.map((key) => {
      const { icon, className } = outcomeIcons[stepOutcomes[key]]
      const total = review[key].length
      return {
        key,
        label: stepCountTitle(key, audience),
        icon,
        className,
        value: total,
        onOpen:
          total > 0
            ? () =>
                toOverview(() =>
                  document.getElementById(stepGroupId(key))?.scrollIntoView({ behavior: "smooth", block: "start" })
                )
            : undefined
      }
    }),
    {
      key: "met",
      label: "Rules met",
      icon: ListChecksIcon,
      className: "text-green-600 dark:text-green-400",
      value: (
        <>
          {rules.met}
          <span className="text-sm font-normal text-muted-foreground"> of {rules.applying}</span>
        </>
      ),
      onOpen: () => setTab("rules")
    }
  ]

  const allTabs: ReportTab[] = [
    {
      value: "overview",
      label: "Overview",
      content: (
        <NextSteps
          context={context}
          expanded={expanded}
          onExpandedChange={setGroupExpanded}
          onOpenFinding={openFinding}
        />
      )
    },
    {
      value: "rules",
      label: "Rules",
      count: review.selected.length,
      content: <ReviewMatrix context={context} onOpen={openFinding} />
    },
    ...(facts.length > 0
      ? [{ value: "facts", label: "Facts", count: facts.length, content: <PacketFacts context={context} /> }]
      : []),
    {
      value: "summary",
      label: "Summary",
      content: (
        <p className="max-w-prose leading-relaxed whitespace-pre-line">
          <MarkedText text={audience === "committee" ? review.assessment : review.feedback} context={context} />
        </p>
      )
    },
    ...tabs
  ]

  return (
    <div className="flex flex-col gap-6">
      {decision ? (
        <ReviewVerdict
          eyebrow="Committee decision"
          headline={outcomeLabels[decision.outcome]}
          reason={decision.note}
          tone={decisionTones[decision.outcome]}
          meta={
            <p className="text-sm text-muted-foreground">
              Decided {dateFormat.format(new Date(decision.decidedAt))}. The review recommended:{" "}
              {verdictHeadline(review.recommendation, "committee").toLowerCase()}.
            </p>
          }
        >
          <Counts counts={counts} />
        </ReviewVerdict>
      ) : (
        <ReviewVerdict
          eyebrow={audience === "homeowner" ? "Review result" : "The review recommends"}
          headline={verdictHeadline(review.recommendation, audience)}
          reason={verdictReason(review, audience)}
          tone={recommendationTones[review.recommendation]}
          meta={<ReviewDate context={context} />}
        >
          <Counts counts={counts} />
        </ReviewVerdict>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
        <div className="no-scrollbar overflow-x-auto overflow-y-hidden border-b">
          <TabsList variant="line" className="h-10 gap-4 p-0">
            {allTabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-full flex-none px-0.5 group-data-horizontal/tabs:after:bottom-0"
              >
                {item.label}
                {item.count === undefined ? null : (
                  <>
                    {" "}
                    <Badge variant="secondary" className="h-4.5 px-1.5 tabular-nums">
                      {item.count}
                    </Badge>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {allTabs.map((item) => (
          <TabsContent key={item.value} value={item.value} keepMounted={item.value === "overview"}>
            {item.content}
          </TabsContent>
        ))}
      </Tabs>

      <FindingSheet
        context={context}
        finding={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onShowActionItem={showActionItem}
      />
    </div>
  )
}
