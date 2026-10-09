import { cn } from "@/lib/utils"
import type { CoveragePassage as Passage } from "@/rulebook/coverage"
import {
  passageId,
  passageLabel,
  passageName,
  splitAtMarks,
  valueText
} from "../CoverageDocument/CoverageDocument.utils"
import { coverageKindStyles } from "../coverageKinds"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type CoveragePassageProps = {
  passage: Passage
  isSelected: boolean
  /** Chooses the passage; `isFromLabel` when its label button was used, so focus can follow to what covers it. */
  onSelect: (isFromLabel: boolean) => void
}

/**
 * One passage of a document's text, tinted and labelled by what covers it, with the values the rules encode in it
 * underlined. Its label, or its text with a mouse, chooses it, so the coverage panel shows what covers it.
 */
export function CoveragePassage({ passage, isSelected, onSelect }: CoveragePassageProps) {
  const { vocabulary } = useRulebookWorkspace()
  const style = coverageKindStyles[passage.kind]
  const Icon = style.icon
  const heading = passage.type === "provision" && passage.part === "main" ? passage.provision.heading : null
  const offset = heading?.length ?? 0
  const marks = (passage.type === "provision" ? passage.marks : [])
    .filter((mark) => mark.start >= offset)
    .map((mark) => ({ ...mark, start: mark.start - offset, end: mark.end - offset }))

  return (
    <div
      id={passageId(passage.key)}
      className={cn(
        "flex scroll-mt-4 flex-col gap-0.5 rounded-md border-l-4 py-1.5 pr-2 pl-1 text-sm sm:flex-row sm:gap-2 sm:pl-0",
        style.passage,
        isSelected && "ring-2 ring-ring"
      )}
      style={{ marginLeft: `${Math.min(passage.depth, 4) * 0.625}rem` }}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={passageName(passage)}
        className="flex shrink-0 items-start gap-1 self-start rounded-sm px-1.5 py-0.5 text-left text-xs font-medium break-words text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-28"
        onClick={() => onSelect(true)}
      >
        <Icon className={cn("mt-px size-3.5 shrink-0", style.iconColor)} aria-hidden />
        <span className="min-w-0">{passageLabel(passage)}</span>
      </button>
      {/* The text chooses the passage too, for a mouse; the label is the keyboard's way in. */}
      <div
        role="presentation"
        className="min-w-0 flex-1 cursor-pointer px-1.5 leading-relaxed break-words whitespace-pre-line sm:px-0"
        onClick={() => {
          // Selecting text to copy it isn't a click on the passage.
          if (window.getSelection()?.isCollapsed !== false) {
            onSelect(false)
          }
        }}
      >
        {heading ? <span className="font-semibold">{heading}</span> : null}
        {splitAtMarks(passage.text.slice(offset), marks).map((piece) =>
          piece.mark ? (
            <mark
              key={piece.start}
              title={`Encoded as ${valueText(piece.mark.value, vocabulary)}`}
              className="bg-transparent font-semibold text-foreground underline decoration-2 underline-offset-4"
            >
              {piece.text}
            </mark>
          ) : (
            <span key={piece.start}>{piece.text}</span>
          )
        )}
      </div>
    </div>
  )
}
