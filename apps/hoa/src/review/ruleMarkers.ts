import type { RuleKey } from "@/schema/types"

// The writer's rule markers (application-review.md, Write): it refers to a rule only as {{rule:KEY}}, never by a
// section number, and code checks every marker names a rule in the findings. The UI renders each as the rule's
// reference.

const marker = /\{\{rule:([^{}\s]+)\}\}/g

export type MarkerPart = { type: "text"; text: string } | { type: "rule"; ruleKey: RuleKey }

/** A text split into plain text and rule markers. */
export function parseRuleMarkers(text: string): MarkerPart[] {
  const parts: MarkerPart[] = []
  let end = 0
  for (const found of text.matchAll(marker)) {
    if (found.index > end) {
      parts.push({ type: "text", text: text.slice(end, found.index) })
    }
    parts.push({ type: "rule", ruleKey: found[1] ?? "" })
    end = found.index + found[0].length
  }
  if (end < text.length) {
    parts.push({ type: "text", text: text.slice(end) })
  }
  return parts
}

/** The marked rule keys that aren't among `known`, once each. */
export function unknownRuleMarkers(texts: readonly string[], known: ReadonlySet<RuleKey>) {
  const keys = texts.flatMap((text) =>
    parseRuleMarkers(text).flatMap((part) => (part.type === "rule" ? [part.ruleKey] : []))
  )
  return [...new Set(keys.filter((key) => !known.has(key)))]
}

/** A text with each marker replaced, such as by the rule's title. */
export function renderRuleMarkers(text: string, render: (ruleKey: RuleKey) => string) {
  return parseRuleMarkers(text)
    .map((part) => (part.type === "text" ? part.text : render(part.ruleKey)))
    .join("")
}
