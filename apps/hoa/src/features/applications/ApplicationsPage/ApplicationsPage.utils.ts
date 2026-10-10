import type { ChosenFile, FileKind } from "@/components/FileDropzone/FileDropzone"
import type { ProjectDocument } from "@/projectTypes/projectType"

// What the application form works out about the homeowner's files: what each one likely is from its name, and which
// of the documents the project type asks for are covered.

/** The kind for a file that's none of the listed documents, or several of them. */
export const otherKind = "(other)"

const ignored = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "with", "copy", "final", "draft"])

/** A name's words, singular and lowercase, without filler: "Plot_Plans-final.pdf" gives plot, plan. */
function wordsOf(text: string) {
  return text
    .replace(/\.[a-z0-9]+$/i, "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !ignored.has(word))
    .map((word) => word.replace(/ies$/, "y").replace(/(?<!s)s$/, ""))
}

/**
 * The kind a file's name points to, only when it's clear: the kind whose name shares the most words with the file's
 * (all of a one-word name, at least two of a longer one), and no other kind shares as many. "" otherwise.
 */
export function guessKind(fileName: string, kinds: readonly FileKind[]): string {
  const name = new Set(wordsOf(fileName))
  const scored = kinds.flatMap((kind) => {
    const words = [...new Set(wordsOf(kind.label))]
    const matched = words.filter((word) => name.has(word)).length
    return words.length > 0 && matched >= Math.min(2, words.length) ? [{ kind, matched }] : []
  })
  const best = Math.max(0, ...scored.map((item) => item.matched))
  const top = scored.filter((item) => item.matched === best)
  return top.length === 1 && top[0] ? top[0].kind.value : ""
}

export type DocumentStatus = { document: ProjectDocument; files: string[] }

/** Each document the project type asks for, with the files chosen as it. */
export const documentStatuses = (
  documents: readonly ProjectDocument[],
  files: readonly ChosenFile[]
): DocumentStatus[] =>
  documents.map((document) => ({
    document,
    files: files.filter((item) => item.kind === document.documentType).map((item) => item.file.name)
  }))

/** "A, B and C" */
export function listNames(names: readonly string[]) {
  if (names.length <= 1) {
    return names[0] ?? ""
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}
