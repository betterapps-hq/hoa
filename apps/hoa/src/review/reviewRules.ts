import type * as T from "@/schema/types"
import { rulebookVocabulary } from "./documentTypes"
import { workType } from "./subjects"

// What the application page shows about the rules a review considered (application-review.md, UX): only the selected
// rules and the provisions they cite, read from the review's own rules file, so the text can't drift from the review.

export type ReviewRule = {
  key: T.RuleKey
  title: string
  statement: string
  citations: {
    provisionKey: T.ProvisionKey
    label: string
    documentTitle: string
    text: string
    anchors: T.Provision["anchors"]
  }[]
}

/** The selected rules with their cited provisions' text. */
export function reviewRules(rulesFile: T.RulesFile, selected: readonly T.RuleKey[]): ReviewRule[] {
  const keys = new Set(selected)
  const provisions = new Map(rulesFile.provisions.map((provision) => [provision.key, provision]))
  const documents = new Map(rulesFile.documents.map((document) => [document.key, document]))
  return rulesFile.rules
    .filter((rule) => keys.has(rule.key))
    .map((rule) => ({
      key: rule.key,
      title: rule.title,
      statement: rule.statement,
      citations: rule.citations.flatMap((citation) => {
        const provision = provisions.get(citation.provisionKey)
        if (!provision) {
          return []
        }
        const documentKey = provision.key.slice(0, provision.key.indexOf(":"))
        return [
          {
            provisionKey: provision.key,
            label: provision.label,
            documentTitle: documents.get(documentKey)?.title ?? documentKey,
            text: [provision.intro, provision.text].filter(Boolean).join(" "),
            anchors: provision.anchors
          }
        ]
      })
    }))
}

export type ProjectKind = { key: T.TermKey; label: string }

/** The rulebook's project kinds: the categories of work it defines (application-review.md, UX). */
export function projectKinds(rulesFile: T.RulesFile): ProjectKind[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  return [...rulesFile.proposedCore, ...rulesFile.terms]
    .filter((term) => term.kind === "category" && vocabulary.thingOf(term.key) === workType)
    .map((term) => ({ key: term.key, label: vocabulary.label(term.key) }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
}
