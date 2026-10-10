import type { CitedProvision } from "../citedProvision"

export type CitationTextProps = { citation: CitedProvision }

/** The provision's words with its lead-ins and wrap-ups, the operative words marked. */
export function CitationText({ citation }: CitationTextProps) {
  const { text, highlight } = citation
  const isPartial = highlight !== null && highlight.end > highlight.start && highlight.end <= text.length
  return (
    <div className="flex flex-col gap-2 leading-relaxed">
      {citation.intros.map((intro) => (
        <p key={intro} className="text-muted-foreground">
          {intro}
        </p>
      ))}
      <p className="whitespace-pre-line">
        {isPartial ? (
          <>
            {text.slice(0, highlight.start)}
            <mark className="rounded-sm bg-amber-200 dark:bg-amber-700 dark:text-foreground">
              {text.slice(highlight.start, highlight.end)}
            </mark>
            {text.slice(highlight.end)}
          </>
        ) : (
          text
        )}
      </p>
      {citation.wrapUps.map((wrapUp) => (
        <p key={wrapUp} className="text-muted-foreground">
          {wrapUp}
        </p>
      ))}
    </div>
  )
}
