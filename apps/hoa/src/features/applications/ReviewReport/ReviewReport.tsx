import { InfoIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionItemList } from "../ActionItemList/ActionItemList"
import { recommendationLabels, recommendationVariants } from "../applicationDisplay"
import { FindingList } from "../FindingList/FindingList"
import { MarkedText } from "../MarkedText/MarkedText"
import { PacketFacts } from "../PacketFacts/PacketFacts"
import type { ReviewContext } from "../reviewContext"
import { ReviewMatrix } from "../ReviewMatrix/ReviewMatrix"

export type ReviewReportProps = { context: ReviewContext }

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

/**
 * A review: the recommendation and the written summary, what to change, provide and leave to the committee, the rule
 * matrix, every finding, and what the review read from the packet.
 */
export function ReviewReport({ context }: ReviewReportProps) {
  const { review, audience } = context
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
          <CardDescription>
            Checked against the published rulebook on {dateFormat.format(new Date(review.createdAt))}
          </CardDescription>
          <CardAction>
            <Badge variant={recommendationVariants[review.recommendation]}>
              {recommendationLabels[review.recommendation]}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {review.provisional ? (
            <Alert>
              <InfoIcon />
              <AlertTitle>Provisional review</AlertTitle>
              <AlertDescription>
                This review ran before the application was submitted, so it checked it against the rules in force on the
                day it ran. The decision goes by the rules in force on the date of submission.
              </AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm whitespace-pre-line">
            <MarkedText text={audience === "committee" ? review.assessment : review.feedback} context={context} />
          </p>
          <ActionItemList
            title="What to change"
            description={
              review.recommendation === "approve-with-conditions"
                ? "The conditions of approval."
                : "These don't meet the rules as described."
            }
            items={review.changes}
            context={context}
          />
          <ActionItemList
            title="What to provide"
            description="The committee may deny an application that's missing these."
            items={review.missingInformation}
            context={context}
          />
          <ActionItemList
            title="For the committee"
            description="The committee decides these itself."
            items={review.committeeDecisions}
            context={context}
          />
          <ActionItemList
            title="Suggestions"
            description="Recommendations the application doesn't follow. They don't affect the decision."
            items={review.suggestions}
            context={context}
          />
        </CardContent>
      </Card>
      <ReviewMatrix context={context} />
      <FindingList context={context} />
      <PacketFacts context={context} />
    </div>
  )
}
