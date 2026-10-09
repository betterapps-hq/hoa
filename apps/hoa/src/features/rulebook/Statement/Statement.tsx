import { Fragment } from "react"
import { parseStatement } from "@/schema/statement"
import type { Vocabulary } from "@/schema/vocabulary"
import { TermChip } from "../TermChip/TermChip"

export type StatementProps = {
  /** Text with term links, `{{fence-run}}` or `{{lot:plural}}`. */
  text: string
  vocabulary: Vocabulary
  className?: string
}

/** A statement in the organization's words: each term link is its current label, as a term chip. */
export function Statement({ text, vocabulary, className }: StatementProps) {
  return (
    <span className={className}>
      {/* Parts are positional and never reorder, so their index is their key. */}
      {parseStatement(text).map((part, index) =>
        part.type === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <TermChip key={index} termKey={part.key} plural={part.plural} vocabulary={vocabulary} />
        )
      )}
    </span>
  )
}
