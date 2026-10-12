import type { GoverningDocument } from "@/documents/governingDocument"
import { createSearch, isStopWord } from "@/lib/search"
import { documentKindLabels } from "./documentKinds"

// Which existing document a file chosen for upload is likely a new version of, guessed from its name alone (no model):
// the dialog preselects it, and the person confirms or changes it.

/** "CC&Rs" and "CCRs" are one word, so a file named either way matches a title written either way. */
const joinAmpersands = (text: string) => text.replaceAll("&", "")

/** The words of a name that can name a document: camelCase split, no numbers, short words or common words. */
function nameWords(text: string) {
  const words = (
    joinAmpersands(text)
      .replaceAll(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && !/\d/.test(word) && !isStopWord(word))
  return [...new Set(words)]
}

/** The words of a file's name, without its extension, that can name a document. */
const fileNameWords = (fileName: string) => nameWords(fileName.replace(/\.[^.]+$/, ""))

/**
 * The existing document a file is most likely a new version of, or null when it's more likely a new document. Each
 * word of the file's name is matched (typos and prefixes allowed) against each document's title and kind; the document
 * that explains more than half of the words, and more of them than any other, wins. A tie goes to the document with
 * the shorter title (it's the more exact match), and a tie after that to no one.
 */
export function guessDocument(fileName: string, documents: readonly GoverningDocument[]) {
  const words = fileNameWords(fileName)
  if (words.length === 0 || documents.length === 0) {
    return null
  }
  const search = createSearch(documents, {
    id: (document) => document.id,
    fields: {
      title: { text: (document) => joinAmpersands(document.title) },
      kind: { text: (document) => joinAmpersands(documentKindLabels[document.kind]) }
    }
  })
  const hits = new Map<string, number>()
  for (const word of words) {
    for (const id of search.ids(word) ?? []) {
      hits.set(id, (hits.get(id) ?? 0) + 1)
    }
  }
  const titleLength = (document: GoverningDocument) => nameWords(document.title).length
  const ranked = documents
    .map((document) => ({ document, hits: hits.get(document.id) ?? 0 }))
    .filter((candidate) => candidate.hits / words.length > 0.5)
    .toSorted((a, b) => b.hits - a.hits || titleLength(a.document) - titleLength(b.document))
  const [best, next] = ranked
  if (!best) {
    return null
  }
  const isTied = next && next.hits === best.hits && titleLength(next.document) === titleLength(best.document)
  return isTied ? null : best.document
}
