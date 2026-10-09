import type { Rule, Settings, Term } from "@/schema/types"
import { compareCodeUnits } from "./canonical"
import { ruleContentHash, settingsContentHash, termContentHash } from "./carryForward"

// What a draft changes against the published rulebook (encoding.md, Review): records added, changed (the same key with
// different content) and removed, whether the settings changed, and which uploads it reads that the published one
// didn't, and the reverse.

export type RecordChangesOf<R> = {
  /** Keys of draft records the published rulebook doesn't have. */
  added: string[]
  /** Keys of draft records whose content differs from the published record with the same key. */
  changed: string[]
  /** Published records, other than rejected ones, whose key the draft doesn't have. */
  removed: R[]
}

export type RulebookChanges = {
  /** True when nothing is published: the draft is the whole rulebook. */
  isFirst: boolean
  rules: RecordChangesOf<Rule>
  terms: RecordChangesOf<Term>
  settingsChanged: boolean
  /** Upload titles: in the draft's sourceDocumentIds but not the published one's, and the reverse. */
  documents: { added: { id: string; title: string }[]; removed: { id: string; title: string }[] }
}

/** A rulebook as the comparison reads it. */
export type ComparedRulebook = {
  rules: readonly Rule[]
  terms: readonly Term[]
  settings: Settings
  sourceDocumentIds: readonly string[]
}

async function recordChanges<R extends { key: string; review: { status: string } }>(
  draft: readonly R[],
  published: readonly R[],
  hash: (record: R) => Promise<string>
): Promise<RecordChangesOf<R>> {
  const before = new Map(await Promise.all(published.map(async (record) => [record.key, await hash(record)] as const)))
  const keys = new Set(draft.map((record) => record.key))
  const added: string[] = []
  const changed: string[] = []
  for (const record of draft) {
    const previous = before.get(record.key)
    if (previous === undefined) {
      added.push(record.key)
    } else if (previous !== (await hash(record))) {
      changed.push(record.key)
    }
  }
  return {
    added: added.toSorted(compareCodeUnits),
    changed: changed.toSorted(compareCodeUnits),
    removed: published
      .filter((record) => record.review.status !== "rejected" && !keys.has(record.key))
      .toSorted((a, b) => compareCodeUnits(a.key, b.key))
  }
}

/** The draft's changes against the published rulebook, or against nothing when none is published. */
export async function rulebookChanges(
  draft: ComparedRulebook,
  published: ComparedRulebook | null,
  uploads: readonly { id: string; title: string }[]
): Promise<RulebookChanges> {
  const titled = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const upload = uploads.find((item) => item.id === id)
      return upload ? [{ id, title: upload.title }] : []
    })
  const publishedIds = new Set(published?.sourceDocumentIds)
  const draftIds = new Set(draft.sourceDocumentIds)
  const [rules, terms, draftSettings, publishedSettings] = await Promise.all([
    recordChanges(draft.rules, published?.rules ?? [], ruleContentHash),
    recordChanges(draft.terms, published?.terms ?? [], termContentHash),
    settingsContentHash(draft.settings),
    published ? settingsContentHash(published.settings) : null
  ])
  return {
    isFirst: published === null,
    rules,
    terms,
    settingsChanged: draftSettings !== publishedSettings,
    documents: {
      added: titled(draft.sourceDocumentIds.filter((id) => !publishedIds.has(id))),
      removed: titled((published?.sourceDocumentIds ?? []).filter((id) => !draftIds.has(id)))
    }
  }
}
