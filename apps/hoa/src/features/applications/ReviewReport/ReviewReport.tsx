import { useId, useState, type ReactNode } from "react"
import type { Application } from "@/applications/application"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ActionItem } from "@/review/reviewModel"
import type { Finding } from "@/schema/types"
import { outcomeLabels } from "../applicationDisplay"
import { FindingSheet } from "../FindingSheet/FindingSheet"
import { MarkedText } from "../MarkedText/MarkedText"
import { NextSteps } from "../NextSteps/NextSteps"
import { stepGroups, stepsHeading, type StepKey } from "../NextSteps/NextSteps.utils"
import { PacketFacts, packetFacts } from "../PacketFacts/PacketFacts"
import { actionItemId, type ReviewContext } from "../reviewContext"
import { ReviewDetail } from "../ReviewDetail/ReviewDetail"
import { ReviewMatrix } from "../ReviewMatrix/ReviewMatrix"
import { ReviewVerdict } from "../ReviewVerdict/ReviewVerdict"
import {
  countOf,
  decisionTones,
  recommendationTones,
  verdictHeadline,
  verdictReason
} from "../ReviewVerdict/ReviewVerdict.utils"

export type ReviewReportProps = {
  context: ReviewContext
  /** The committee's decision; once made, it takes the recommendation's place at the top. */
  decision: Application["decision"]
  /** Whether the reader acts on the review now: the homeowner preparing the application, the committee deciding it. */
  isActing: boolean
  /** The one thing to do now, under the next steps. */
  action?: ReactNode
  /** More disclosure sections from the page, such as the packet's files; each an AccordionItem. */
  details?: ReactNode
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

/**
 * A review as the application page shows it: the recommendation, large, with one sentence of why; the next steps, in
 * the order that changes the outcome; the one thing to do now; and everything else behind disclosure.
 */
export function ReviewReport({ context, decision, isActing, action, details }: ReviewReportProps) {
  const { review, audience } = context
  const detailsId = useId()
  const [selected, setSelected] = useState<Finding | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<StepKey>>(new Set())
  const facts = packetFacts(review)
  const showsSteps = decision === null

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
  const showActionItem = (item: ActionItem) => {
    const group = stepGroups(review, audience).find((found) => found.items.includes(item))
    if (group) {
      setGroupExpanded(group.key, true)
    }
    setIsSheetOpen(false)
    // After the sheet gives focus back, move it to the action item.
    requestAnimationFrame(() => {
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
  const steps = (heading: string | null) => (
    <NextSteps
      context={context}
      heading={heading}
      expanded={expanded}
      onExpandedChange={setGroupExpanded}
      onOpenFinding={openFinding}
    />
  )

  return (
    <div className="flex flex-col gap-10">
      {decision ? (
        <ReviewVerdict
          eyebrow="Committee decision"
          headline={outcomeLabels[decision.outcome]}
          reason={decision.note}
          tone={decisionTones[decision.outcome]}
        >
          <p className="text-sm text-muted-foreground">
            Decided {dateFormat.format(new Date(decision.decidedAt))}. The review recommended:{" "}
            {verdictHeadline(review.recommendation, "committee").toLowerCase()}.
          </p>
        </ReviewVerdict>
      ) : (
        <ReviewVerdict
          eyebrow={audience === "homeowner" ? "Review result" : "The review recommends"}
          headline={verdictHeadline(review.recommendation, audience)}
          reason={verdictReason(review, audience)}
          tone={recommendationTones[review.recommendation]}
        >
          <ReviewDate context={context} />
        </ReviewVerdict>
      )}

      {showsSteps ? steps(stepsHeading(audience, isActing)) : null}

      {action}

      <section aria-labelledby={detailsId} className="flex flex-col">
        <h2 id={detailsId} className="text-sm font-medium text-muted-foreground">
          Details
        </h2>
        <Accordion multiple>
          {showsSteps ? null : (
            <ReviewDetail value="found" title="What the review found">
              {steps(null)}
            </ReviewDetail>
          )}
          <ReviewDetail
            value="rules"
            title="How each rule was checked"
            meta={countOf(review.selected.length, "rule", "rules")}
          >
            <ReviewMatrix context={context} onOpen={openFinding} />
          </ReviewDetail>
          {facts.length > 0 ? (
            <ReviewDetail
              value="facts"
              title={audience === "homeowner" ? "What the review read from your packet" : "What the review read"}
              meta={countOf(facts.length, "fact", "facts")}
            >
              <PacketFacts context={context} />
            </ReviewDetail>
          ) : null}
          <ReviewDetail value="summary" title="The review's written summary">
            <p className="max-w-prose whitespace-pre-line">
              <MarkedText text={audience === "committee" ? review.assessment : review.feedback} context={context} />
            </p>
          </ReviewDetail>
          {details}
        </Accordion>
      </section>

      <FindingSheet
        context={context}
        finding={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onShowActionItem={showsSteps ? showActionItem : undefined}
      />
    </div>
  )
}
