import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { Review } from "@/review/reviewModel"
import { factStateLabels, factText, percent, sentenceCase } from "../applicationDisplay"
import { EvidenceList } from "../EvidenceList/EvidenceList"
import { entityLabel, type ReviewContext } from "../reviewContext"

export type PacketFactsProps = { context: ReviewContext }

/** The facts the review read from the packet, as opposed to the portal's own records. */
export const packetFacts = (review: Review) =>
  review.request.facts.filter((fact) => fact.provenance.by === "extraction")

/**
 * "What the review read from your packet": every fact the review read, per entity, with where it read it and how sure
 * it is, so the homeowner can correct a misread before submitting.
 */
export function PacketFacts({ context }: PacketFactsProps) {
  const { review, vocabulary, audience } = context
  const read = packetFacts(review)
  const byEntity = Map.groupBy(read, (fact) => fact.entity)
  const entities = review.request.entities.filter((entity) => byEntity.has(entity.id))
  const label = (id: string) => entityLabel(context, id)
  if (entities.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">
        {audience === "homeowner"
          ? "Check these before you submit. If something is misread, add a page that states it plainly; the review runs again."
          : "The facts the findings rest on, with where each was read."}
      </p>
      <Accordion multiple>
        {entities.map((entity) => {
          const facts = byEntity.get(entity.id) ?? []
          return (
            <AccordionItem key={entity.id} value={entity.id}>
              <AccordionTrigger>
                <span className="flex flex-col">
                  <span>{entity.label}</span>
                  <span className="font-normal text-muted-foreground">
                    {sentenceCase(vocabulary.label(entity.type))},{" "}
                    {facts.length === 1 ? "1 fact" : `${facts.length} facts`}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <dl className="flex flex-col divide-y">
                  {facts.map((fact) => {
                    const state = factStateLabels[fact.state]
                    return (
                      <div key={fact.property} className="flex flex-col gap-1.5 py-3 text-sm sm:flex-row sm:gap-4">
                        <dt className="font-medium sm:w-48 sm:shrink-0">
                          {sentenceCase(vocabulary.label(fact.property))}
                        </dt>
                        <dd className="flex min-w-0 flex-col gap-1.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span>{factText(fact, vocabulary, label)}</span>
                            {state ? <Badge variant="outline">{state}</Badge> : null}
                            {fact.confidence !== null ? (
                              <span className="text-muted-foreground">confidence {percent(fact.confidence)}</span>
                            ) : null}
                          </span>
                          {fact.stated && fact.stated !== factText(fact, vocabulary, label) ? (
                            <span className="text-muted-foreground">Written as “{fact.stated}”</span>
                          ) : null}
                          <EvidenceList evidence={fact.evidence} context={context} />
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
