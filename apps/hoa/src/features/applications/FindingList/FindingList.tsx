import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CitationText } from "../../rulebook/CitationText/CitationText"
import { ProvisionReference } from "../../rulebook/ProvisionReference/ProvisionReference"
import { Statement } from "../../rulebook/Statement/Statement"
import { findingLabels } from "../applicationDisplay"
import { entityLabel, type ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"
import { findingGroups } from "./FindingList.utils"

export type FindingListProps = { context: ReviewContext }

/** Every finding, grouped by outcome: the rule, its statement, what it's about, why, and the provision's text. */
export function FindingList({ context }: FindingListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Findings</CardTitle>
        <CardDescription>
          What the review found for each rule, with the words of the provision it cites.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion multiple>
          {findingGroups(context.review.findings).map((group) => (
            <AccordionItem key={group.outcome} value={group.outcome}>
              <AccordionTrigger>
                {findingLabels[group.outcome]} ({group.count})
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col divide-y">
                  {group.items.map((item) => {
                    const rule = context.rules.get(item.ruleKey)
                    const [citation] = rule?.citations ?? []
                    return (
                      <li key={`${item.ruleKey} ${item.reason}`} className="flex flex-col gap-1.5 py-3 text-sm">
                        <ReviewRuleReference ruleKey={item.ruleKey} context={context} />
                        {rule ? (
                          <Statement
                            text={rule.statement}
                            vocabulary={context.vocabulary}
                            className="text-muted-foreground"
                          />
                        ) : null}
                        <p>
                          <span className="font-medium">
                            {item.entities.map((id) => entityLabel(context, id)).join(", ")}:
                          </span>{" "}
                          {item.reason}
                        </p>
                        {citation ? (
                          <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
                            <CitationText citation={citation} />
                            <p>
                              <ProvisionReference citation={citation} source={context.source}>
                                View in document
                                <span className="sr-only">: {citation.label}</span>
                              </ProvisionReference>
                            </p>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
