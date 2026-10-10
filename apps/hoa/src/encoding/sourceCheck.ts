import { z } from "zod"
import { documentStructure, documentsOf, type DocumentStructure } from "@/documents/documentStructure"
import type { Edition } from "@/schema/types"
import { governingDocument } from "@/schema/zod"

// The build's first step (encoding.md, Stages, Check): everything later steps check about the uploads themselves (their
// documents, editions, files and structure, as merge and save-draft validate them) is checked before any model call, so
// a bad record stops the build at once instead of after an hour of encoding.

export type SourceToCheck = { documentId: string; title: string; structure: DocumentStructure; edition: Edition }

/**
 * What's wrong with an upload, by kind: its file is missing from its record, or the record's file can't be read, or the
 * way it's split into documents can't be used, or it has the same key as another upload.
 */
export const sourceProblemKinds = ["file-missing", "file-invalid", "structure-invalid", "duplicate-key"] as const
export type SourceProblemKind = (typeof sourceProblemKinds)[number]

export const sourceProblemSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  kind: z.enum(sourceProblemKinds),
  /** The other upload, for a duplicate key. */
  otherTitle: z.string().optional(),
  /** For developers: where the record is wrong and how, as the schema says it. Logs only, never the page. */
  detail: z.string()
})
export type SourceProblem = z.infer<typeof sourceProblemSchema>

/** Where an issue is, in words: "edition.files[0].sha256". */
const pathText = (path: readonly PropertyKey[]) =>
  path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${String(step)}`))
    .join("")
    .replace(/^\./, "")

/** The value at a path in a parsed value, or undefined when the path leads nowhere. */
function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let current = value
  for (const step of path) {
    if (typeof current !== "object" || current === null) {
      return undefined
    }
    current = Reflect.get(current, step)
  }
  return current
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)

/** The kind of a record issue: anything about the edition's files is about the file; the rest is the structure. */
function recordIssueKind(document: unknown, path: readonly PropertyKey[]): SourceProblemKind {
  if (!path.includes("files")) {
    return "structure-invalid"
  }
  return isEmpty(valueAt(document, path)) ? "file-missing" : "file-invalid"
}

/** What's wrong with the uploads, each problem naming its upload; empty when nothing is. */
export function checkSources(sources: readonly SourceToCheck[]): SourceProblem[] {
  const problems: SourceProblem[] = []
  const owners = new Map<string, SourceToCheck>()
  for (const source of sources) {
    const named = { documentId: source.documentId, title: source.title }
    const structure = documentStructure.safeParse(source.structure)
    if (!structure.success) {
      for (const issue of structure.error.issues) {
        problems.push({
          ...named,
          kind: "structure-invalid",
          detail: `structure.${pathText(issue.path)}: ${issue.message}`
        })
      }
      continue
    }
    for (const document of documentsOf(source.title, structure.data, source.edition)) {
      const parsed = governingDocument.safeParse(document)
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        problems.push({
          ...named,
          kind: recordIssueKind(document, issue.path),
          detail: `document ${document.key}, ${pathText(issue.path)}: ${issue.message}`
        })
      }
      const owner = owners.get(document.key)
      if (owner !== undefined && owner.documentId !== source.documentId) {
        problems.push({
          ...named,
          kind: "duplicate-key",
          otherTitle: owner.title,
          detail: `key ${document.key} is also ${owner.documentId}'s`
        })
      }
      owners.set(document.key, source)
    }
  }
  return problems
}

/** The build refused to start: the uploads have problems later steps would stop at. Retrying doesn't help. */
export class SourcesRejectedError extends Error {
  constructor(readonly problems: readonly SourceProblem[]) {
    super(
      `The uploads can't be built: ${problems.map((problem) => `${problem.documentId} (${problem.kind}) ${problem.detail}`).join("; ")}.`
    )
    this.name = "SourcesRejectedError"
  }
}
