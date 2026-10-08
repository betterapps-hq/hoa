import { useClipboard } from "@mantine/hooks"
import { CheckIcon, CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  findingStatuses,
  findingStatusLabels,
  recommendationLabels,
  type FindingStatus,
  type Review
} from "@/review/review"
import { formatCitation, type Rule } from "@/rules/rules"
import { groupFindings, recommendationBadge } from "./ReviewResult.utils"

export type ReviewResultProps = {
  review: Review
  rules: Rule[]
  costUsd: number | undefined
  latencyMs: number
  traceId: string | undefined
}

const statusIcons: Record<FindingStatus, typeof CircleCheckIcon> = {
  "not-met": CircleAlertIcon,
  unclear: CircleHelpIcon,
  met: CircleCheckIcon
}

const statusIconClasses: Record<FindingStatus, string> = {
  "not-met": "text-red-600 dark:text-red-400",
  unclear: "text-amber-600 dark:text-amber-400",
  met: "text-green-600 dark:text-green-400"
}

export function ReviewResult({ review, rules, costUsd, latencyMs, traceId }: ReviewResultProps) {
  const groups = groupFindings(review.findings, rules)
  const clipboard = useClipboard({ timeout: 2000 })
  const [showMet, setShowMet] = useState(false)
  const visibleStatuses = findingStatuses.filter((status) => status !== "met" || showMet)

  return (
    <article aria-labelledby="review-heading" className="flex flex-col gap-4 md:gap-6">
      <Card>
        <CardHeader>
          <CardDescription>Recommendation</CardDescription>
          <CardTitle>
            <h2 id="review-heading" className="text-2xl font-semibold">
              {recommendationLabels[review.recommendation]}
            </h2>
          </CardTitle>
          <CardAction>
            <Badge variant={recommendationBadge[review.recommendation]}>
              {findingStatuses
                .map((status) => `${groups[status].length} ${findingStatusLabels[status].toLowerCase()}`)
                .join(", ")}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>{review.assessment}</p>
          {review.conditions.length > 0 && (
            <div>
              <h3 className="font-medium">Conditions</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {review.conditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:gap-6 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Proposed project</h3>
            </CardTitle>
            <CardDescription>{review.project.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {review.project.details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="min-w-0 break-words">
                    {detail.value === "Not provided" ? (
                      <Badge variant="outline">
                        <CircleHelpIcon className={statusIconClasses.unclear} />
                        Not provided
                      </Badge>
                    ) : (
                      detail.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Information to provide</h3>
            </CardTitle>
            <CardDescription>
              {review.missingInformation.length === 0
                ? "Nothing is missing."
                : `${review.missingInformation.length} items before the committee can decide.`}
            </CardDescription>
          </CardHeader>
          {review.missingInformation.length > 0 && (
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {review.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Rule-by-rule findings</h3>
          </CardTitle>
          <CardDescription>
            Every approved rule for this project type, with the evidence behind each finding.
          </CardDescription>
          {groups.met.length > 0 && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setShowMet(!showMet)}>
                {showMet ? "Hide rules that are met" : `Show ${groups.met.length} rules that are met`}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              {visibleStatuses.map((status) => {
                const Icon = statusIcons[status]
                return (
                  <TableBody key={status} aria-label={findingStatusLabels[status]}>
                    {groups[status].map((finding) => (
                      <TableRow key={finding.ruleId}>
                        <TableCell className="font-medium whitespace-normal">
                          {finding.rule?.title ?? finding.ruleId}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="px-1.5 text-muted-foreground">
                            <Icon className={statusIconClasses[status]} />
                            {findingStatusLabels[status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-72 whitespace-normal">
                          <p>{finding.explanation}</p>
                          <p className="mt-1 text-muted-foreground">Evidence: {finding.evidence}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {finding.rule ? formatCitation(finding.rule.source) : "Not in the rulebook"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )
              })}
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Feedback for the homeowner</h3>
          </CardTitle>
          <CardDescription>A message you can send as-is or edit.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => clipboard.copy(review.feedback)}>
              {clipboard.copied ? <CheckIcon /> : <CopyIcon />}
              {clipboard.copied ? "Copied" : "Copy feedback"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{review.feedback}</p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Reviewed in {(latencyMs / 1000).toFixed(1)} seconds
        {costUsd === undefined
          ? ""
          : `, cost ${costUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 })}`}
        {traceId ? `. Langfuse trace ${traceId}` : ""}.
      </p>
    </article>
  )
}
