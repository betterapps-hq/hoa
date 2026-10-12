import { Fragment } from "react"
import { parseRuleMarkers } from "@/review/ruleMarkers"
import type { ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"

export type MarkedTextProps = {
  /** The writer's text, with rule markers such as {{rule:guidelines:5.4.2(i)#colors}}. */
  text: string
  context: Pick<ReviewContext, "rules" | "source">
}

/** The writer's text with every rule marker as a reference to the rule and its citation. */
export function MarkedText({ text, context }: MarkedTextProps) {
  return (
    <>
      {/* Parts are positional and never reorder, so their index is their key. */}
      {parseRuleMarkers(text).map((part, index) =>
        part.type === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <ReviewRuleReference key={index} ruleKey={part.ruleKey} context={context} />
        )
      )}
    </>
  )
}
