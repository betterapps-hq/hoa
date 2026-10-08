import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ActionItem, Recommendation, Review } from "@/review/reviewModel"
import { componentLabel, findingLabels, groupFindings, recommendationLabels } from "../applicationDisplay"
import type { ReviewRule } from "../applications.functions"

const recommendationVariants: Record<Recommendation, "default" | "secondary" | "destructive" | "outline"> = {
  approve: "default",
  "approve-with-conditions": "secondary",
  "request-information": "outline",
  reject: "destructive"
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

function ItemList({ title, description, items }: { title: string; description: string; items: ActionItem[] }) {
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
          <li key={item.id}>{item.text}</li>
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
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))
  const groups = groupFindings(review.findings)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          Checked against rulebook version {review.rulebookVersion} on {dateFormat.format(new Date(review.createdAt))}
        </CardDescription>
        <CardAction>
          <Badge variant={recommendationVariants[review.recommendation]}>
            {recommendationLabels[review.recommendation]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm whitespace-pre-line">{audience === "committee" ? review.assessment : review.feedback}</p>
        <ItemList
          title="What to change"
          description={
            review.recommendation === "approve-with-conditions"
              ? "The conditions of approval."
              : "These don't meet the rules as described."
          }
          items={review.changes}
        />
        <ItemList
          title="What to provide"
          description="The committee may deny an application that's missing these."
          items={review.missingInformation}
        />
        <ItemList
          title="For the committee"
          description="The committee decides these itself; they don't change the recommendation."
          items={review.committeeDecisions}
        />
        <section aria-label="Findings" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Findings</h3>
          <Accordion>
            {groups.map((group) => (
              <AccordionItem key={group.status} value={group.status}>
                <AccordionTrigger>
                  {findingLabels[group.status]} ({group.findings.length})
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-3">
                    {group.findings.map((finding) => {
                      const rule = rulesById.get(finding.ruleId)
                      return (
                        <li key={finding.id} className="flex flex-col gap-0.5 text-sm">
                          <span className="font-medium">
                            {rule?.title ?? finding.ruleId}
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              ({componentLabel(review, finding.componentId)})
                            </span>
                          </span>
                          <span>{finding.explanation}</span>
                          {rule?.citations[0] ? (
                            <span className="text-muted-foreground">
                              {rule.citations[0].section}, page{" "}
                              {rule.citations[0].pageLabel ?? rule.citations[0].pageIndex}
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
