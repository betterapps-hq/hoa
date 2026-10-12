import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
import { sentenceCase } from "@/lib/text"
import type { Vocabulary } from "@/schema/vocabulary"
import { describeTermKind } from "./TermChip.utils"

export type TermChipProps = {
  termKey: string
  plural?: boolean
  vocabulary: Vocabulary
  /** Shown on its own, as in a table cell, rather than inside a sentence: its first letter capitalized. */
  isStandalone?: boolean
}

/** A term shown by its label; activating it shows its labels, definition and kind. */
export function TermChip({ termKey, plural = false, vocabulary, isStandalone = false }: TermChipProps) {
  const term = vocabulary.get(termKey)
  const written = vocabulary.label(termKey, plural)
  const label = isStandalone ? sentenceCase(written) : written
  if (!term) {
    return (
      <span className="text-destructive underline decoration-wavy underline-offset-4" title={`${termKey} isn't a term`}>
        {label}
      </span>
    )
  }
  const preferred = vocabulary.label(termKey)
  const others = term.labels.filter((item) => item.role === "alternative").map((item) => item.text)
  const avoided = term.labels.filter((item) => item.role === "avoid").map((item) => item.text)
  return (
    <Popover>
      {/* A span, not a button, so a long label wraps with the sentence around it. */}
      <PopoverTrigger
        nativeButton={false}
        render={
          <span className="cursor-pointer rounded-sm font-medium text-foreground underline decoration-muted-foreground decoration-dotted underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {label}
          </span>
        }
      />
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{sentenceCase(preferred)}</PopoverTitle>
          <PopoverDescription>{describeTermKind(term, vocabulary)}</PopoverDescription>
        </PopoverHeader>
        {term.definition ? <p>{term.definition}</p> : null}
        {term.scopeNote ? <p className="text-muted-foreground">{term.scopeNote}</p> : null}
        {others.length > 0 ? <p>Also called: {others.join(", ")}</p> : null}
        {avoided.length > 0 ? <p>Not used: {avoided.join(", ")}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs text-muted-foreground">{term.key}</code>
          {term.organizationId === null ? <Badge variant="outline">Core</Badge> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
