import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ActionItem, Recommendation, Review } from "@/review/reviewModel"
import type { ReviewRule } from "@/review/reviewRules"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import { entityLabel, findingLabels, groupFindings, recommendationLabels } from "../applicationDisplay"

const recommendationVariants: Record<Recommendation, "default" | "secondary" | "destructive" | "outline"> = {
  approve: "default",
  "approve-with-conditions": "secondary",
  "request-information": "outline",
  "refer-to-committee": "outline",
  deny: "destructive"
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

function ItemList({
  title,
  description,
  items,
  render
}: {
  title: string
  description: string
  items: ActionItem[]
  render: (text: string) => string
}) {
  if (items.length === 0) {
    return null
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item.id}>{render(item.text)}</li>
        ))}
      </ul>
    </section>
  )
}

export type ReviewReportProps = {
  review: Review
  rules: ReviewRule[]
  /** The committee reads the assessment; the homeowner reads the feedback. */
  audience: "homeowner" | "committee"
}

/** A review's recommendation, what to change or provide, what the committee decides, and every finding. */
export function ReviewReport({ review, rules, audience }: ReviewReportProps) {
  const rulesByKey = new Map(rules.map((rule) => [rule.key, rule]))
  const titleOf = (ruleKey: string) => rulesByKey.get(ruleKey)?.title ?? ruleKey
  // The rule references in the written text become links in the review UX; until then they read as rule titles.
  const render = (text: string) => renderRuleMarkers(text, titleOf)
  const groups = groupFindings(review.findings)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          Checked against the published rulebook on {dateFormat.format(new Date(review.createdAt))}
          {review.provisional ? ", before submission" : ""}
        </CardDescription>
        <CardAction>
          <Badge variant={recommendationVariants[review.recommendation]}>
            {recommendationLabels[review.recommendation]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm whitespace-pre-line">
          {render(audience === "committee" ? review.assessment : review.feedback)}
        </p>
        <ItemList
          title="What to change"
          description={
            review.recommendation === "approve-with-conditions"
              ? "The conditions of approval."
              : "These don't meet the rules as described."
          }
          items={review.changes}
          render={render}
        />
        <ItemList
          title="What to provide"
          description="The committee may deny an application that's missing these."
          items={review.missingInformation}
          render={render}
        />
        <ItemList
          title="For the committee"
          description="The committee decides these itself."
          items={review.committeeDecisions}
          render={render}
        />
        <ItemList
          title="Suggestions"
          description="Recommendations the application doesn't follow."
          items={review.suggestions}
          render={render}
        />
        <section aria-label="Findings" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Findings</h3>
          <Accordion>
            {groups.map((group) => (
              <AccordionItem key={group.outcome} value={group.outcome}>
                <AccordionTrigger>
                  {findingLabels[group.outcome]} ({group.findings.length})
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-3">
                    {group.findings.map((finding) => {
                      const citation = rulesByKey.get(finding.ruleKey)?.citations[0]
                      return (
                        <li key={`${finding.ruleKey} ${finding.entity}`} className="flex flex-col gap-0.5 text-sm">
                          <span className="font-medium">
                            {titleOf(finding.ruleKey)}
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              ({entityLabel(review, finding.entity)})
                            </span>
                          </span>
                          <span>{finding.reason}</span>
                          {citation ? (
                            <span className="text-muted-foreground">
                              {citation.documentTitle} {citation.label}
                            </span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </CardContent>
    </Card>
  )
}
