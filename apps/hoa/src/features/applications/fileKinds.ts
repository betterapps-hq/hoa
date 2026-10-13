import { otherKind } from "@/applications/uploadedAs"
import type { FileKind } from "@/components/FileDropzone/FileDropzone"
import { listNames, sentenceCase } from "@/lib/text"
import type { ProjectDocument, ProjectTypeDefinition } from "@/projectTypes/projectType"
import { validateUpload } from "@/storage/uploadRules"

// What the application works out about the homeowner's files: what each one can be and likely is from its name, which
// of the documents the project type asks for are covered, and a document a file's format doesn't suit.

/** What a file can be for a project type: each of its documents, or something else; null when it lists none. */
export const kindsOf = (definition: ProjectTypeDefinition | null): FileKind[] | null =>
  definition && definition.documents.length > 0
    ? [
        ...definition.documents.map((document) => ({
          value: document.documentType,
          label: sentenceCase(document.label)
        })),
        { value: otherKind, label: "Other or several documents" }
      ]
    : null

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

/** A file as the checklist reads it: its name, and what the homeowner said it is. */
export type KindedFile = { name: string; kind: string | null }

export type DocumentStatus = { document: ProjectDocument; files: string[] }

/** Each document the project type asks for, with the files said to be it. */
export const documentStatuses = (
  documents: readonly ProjectDocument[],
  files: readonly KindedFile[]
): DocumentStatus[] =>
  documents.map((document) => ({
    document,
    files: files.filter((item) => item.kind === document.documentType).map((item) => item.name)
  }))

const formatNames = { pdf: "PDF", docx: "Word", image: "JPEG or PNG" } as const

/** Why a file can't be the document it's said to be, from the formats the document takes; null when it can. */
export function kindProblem(
  file: { name: string; type: string; size: number },
  definition: ProjectTypeDefinition | null,
  kind: string
) {
  const document = definition?.documents.find((entry) => entry.documentType === kind)
  const upload = validateUpload(file, "application")
  if (!document?.accepts || !upload.isValid || document.accepts.includes(upload.upload.format)) {
    return null
  }
  const names = document.accepts.map((format) => formatNames[format])
  return `The ${document.label.toLowerCase()} takes ${listNames(names)} files; ${file.name} isn't one.`
}
