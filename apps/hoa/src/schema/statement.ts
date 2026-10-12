import type { TermKey } from "./types"

// A rule's statement links terms as {{fence-run}} or {{lot:plural}} (schema.md, Labels), so screens show the term's
// current preferred label.

export type StatementPart = { type: "text"; text: string } | { type: "term"; key: TermKey; plural: boolean }

const termLink = /\{\{([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)(:plural)?\}\}/g

export function parseStatement(statement: string): StatementPart[] {
  const parts: StatementPart[] = []
  let end = 0
  for (const link of statement.matchAll(termLink)) {
    if (link.index > end) {
      parts.push({ type: "text", text: statement.slice(end, link.index) })
    }
    parts.push({ type: "term", key: link[1], plural: link[2] !== undefined })
    end = link.index + link[0].length
  }
  if (end < statement.length) {
    parts.push({ type: "text", text: statement.slice(end) })
  }
  return parts
}

export function renderStatement(statement: string, label: (key: TermKey, plural: boolean) => string) {
  return parseStatement(statement)
    .map((part) => (part.type === "text" ? part.text : label(part.key, part.plural)))
    .join("")
}
