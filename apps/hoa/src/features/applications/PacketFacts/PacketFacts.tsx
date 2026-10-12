import { useId } from "react"
import { Badge } from "@/components/ui/badge"
import type { Review } from "@/review/reviewModel"
import type { Fact } from "@/schema/types"
import { factStateLabels, factText, percent, sentenceCase } from "../applicationDisplay"
import { EvidenceList } from "../EvidenceList/EvidenceList"
import { entityLabel, type ReviewContext } from "../reviewContext"

export type PacketFactsProps = { context: ReviewContext }

/** The facts the review read from the packet, as opposed to the portal's own records. */
export const packetFacts = (review: Review) =>
  review.request.facts.filter((fact) => fact.provenance.by === "extraction")

/** One fact: what it is, what the review read, how sure it is, and the words it read it from. */
function FactRow({ fact, context }: { fact: Fact; context: ReviewContext }) {
  const { vocabulary } = context
  const value = factText(fact, vocabulary, (id) => entityLabel(context, id))
  const state = factStateLabels[fact.state]
  // The stated words matter when they differ from the value and no quote already shows them.
  const isWrittenOtherwise =
    fact.stated !== null &&
    fact.stated !== value &&
    !fact.evidence.some((item) => item.quote?.includes(fact.stated ?? "") === true)
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-muted-foreground">{sentenceCase(vocabulary.label(fact.property))}</dt>
      <dd className="flex min-w-0 flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{sentenceCase(value)}</span>
          {state ? <Badge variant="outline">{state}</Badge> : null}
          {fact.confidence === null ? null : (
            <Badge variant="secondary" className="tabular-nums">
              {percent(fact.confidence)} confidence
            </Badge>
          )}
        </span>
        {isWrittenOtherwise ? <span className="text-muted-foreground">Written as “{fact.stated}”</span> : null}
        <EvidenceList evidence={fact.evidence} context={context} />
      </dd>
    </div>
  )
}

/** One part of the project and the facts read about it, as a card. */
function EntityFacts({
  entity,
  facts,
  context
}: {
  entity: Review["request"]["entities"][number]
  facts: readonly Fact[]
  context: ReviewContext
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-xl border bg-card text-sm shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h3 id={headingId} className="font-medium">
            {entity.label}
          </h3>
          <p className="text-xs text-muted-foreground">{sentenceCase(context.vocabulary.label(entity.type))}</p>
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {facts.length === 1 ? "1 fact" : `${facts.length} facts`}
        </Badge>
      </div>
      <dl className="flex flex-col divide-y">
        {facts.map((fact) => (
          <FactRow key={fact.property} fact={fact} context={context} />
        ))}
      </dl>
    </section>
  )
}

/**
 * What the review read from the packet: every fact, a card per part of the project, with the words it read it from
 * and how sure it is, so the homeowner can correct a misread before submitting.
 */
export function PacketFacts({ context }: PacketFactsProps) {
  const { review, audience } = context
  const byEntity = Map.groupBy(packetFacts(review), (fact) => fact.entity)
  const entities = review.request.entities.filter((entity) => byEntity.has(entity.id))
  if (entities.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        {audience === "homeowner"
          ? "Check these before you submit. If something is misread, add a page that states it plainly; the review runs again."
          : "The facts the findings rest on, with where each was read."}
      </p>
      {entities.map((entity) => (
        <EntityFacts key={entity.id} entity={entity} facts={byEntity.get(entity.id) ?? []} context={context} />
      ))}
    </div>
  )
}
