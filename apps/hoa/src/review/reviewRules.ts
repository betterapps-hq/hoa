import type * as T from "@/schema/types"
import { rulebookVocabulary } from "./documentTypes"
import { workType } from "./subjects"

export type ProjectKind = { key: T.TermKey; label: string }

/** The rulebook's project kinds: the categories of work it defines (application-review.md, UX). */
export function projectKinds(rulesFile: T.RulesFile): ProjectKind[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  return [...rulesFile.proposedCore, ...rulesFile.terms]
    .filter((term) => term.kind === "category" && vocabulary.thingOf(term.key) === workType)
    .map((term) => ({ key: term.key, label: vocabulary.label(term.key) }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
}
