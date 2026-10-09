import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
import { workType } from "@/review/subjects"
import type { EvaluationRequest } from "@/schema/types"
import { sentenceCase } from "../applicationDisplay"
import { EvidenceList } from "../EvidenceList/EvidenceList"
import { rootEntityIds, type ReviewContext } from "../reviewContext"

export type EntityHeaderProps = {
  entity: EvaluationRequest["entities"][number]
  context: Pick<ReviewContext, "vocabulary" | "entityEvidence" | "files" | "loadImage">
}

/** An entity's name; activating it shows what the review identified: its type, its label and what named it. */
export function EntityHeader({ entity, context }: EntityHeaderProps) {
  const evidence = context.entityEvidence.get(entity.id) ?? []
  const type = sentenceCase(context.vocabulary.label(entity.type))
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="link"
            className="h-auto justify-start p-0 text-left font-medium whitespace-normal text-foreground"
            aria-label={`${entity.label}: what was identified`}
          />
        }
      >
        {entity.label}
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{entity.label}</PopoverTitle>
          <PopoverDescription>{type}</PopoverDescription>
        </PopoverHeader>
        {evidence.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Identified from</p>
            <EvidenceList evidence={evidence} context={context} />
          </div>
        ) : (
          <p className="text-muted-foreground">
            {entity.type === workType || rootEntityIds.includes(entity.id)
              ? "Every application has one."
              : "The review didn’t keep what identified it."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
