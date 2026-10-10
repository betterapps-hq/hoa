import { documentStructure, documentsOf, type DocumentStructure } from "@/documents/documentStructure"
import type { Edition } from "@/schema/types"
import { governingDocument } from "@/schema/zod"

// The build's first step (encoding.md, Stages, Check): everything later steps check about the uploads themselves (their
// documents, editions, files and structure, as merge and save-draft validate them) is checked before any model call, so
// a bad record stops the build at once instead of after an hour of encoding.

export type SourceToCheck = { documentId: string; title: string; structure: DocumentStructure; edition: Edition }

/** Where an issue is, in words: "edition.files[0].sha256". */
const pathText = (path: readonly PropertyKey[]) =>
  path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${String(step)}`))
    .join("")
    .replace(/^\./, "")

/** What's wrong with the uploads, one plain sentence each naming the document; empty when nothing is. */
export function checkSources(sources: readonly SourceToCheck[]): string[] {
  const problems: string[] = []
  const owners = new Map<string, string>()
  for (const source of sources) {
    const named = `The document “${source.title}”`
    const structure = documentStructure.safeParse(source.structure)
    if (!structure.success) {
      for (const issue of structure.error.issues) {
        problems.push(`${named} has a structure the build can't use: ${pathText(issue.path)} ${issue.message}.`)
      }
      continue
    }
    for (const document of documentsOf(source.title, structure.data, source.edition)) {
      const parsed = governingDocument.safeParse(document)
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const where = document.key === structure.data.key ? named : `${named} (its part ${document.key})`
        problems.push(`${where} has a record the build can't save: ${pathText(issue.path)} ${issue.message}.`)
      }
      const owner = owners.get(document.key)
      if (owner !== undefined && owner !== source.documentId) {
        problems.push(`${named} has the key ${document.key}, which another document already uses.`)
      }
      owners.set(document.key, source.documentId)
    }
  }
  return problems
}

/** The build refused to start: the uploads have problems later steps would stop at. Retrying doesn't help. */
export class SourcesRejectedError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join(" "))
    this.name = "SourcesRejectedError"
  }
}
