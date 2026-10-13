import type { ProjectDocument, ProjectTypeDefinition } from "@/projectTypes/projectType"

// What the homeowner says each file is (application-review.md, Applications): one of the documents the project type
// lists, or something else. A file uploaded as one of the documents tells the review which, and what it must show.

/** A file that's none of the listed documents, or several of them. */
export const otherKind = "(other)"

/** Whether the homeowner can say a file is this: one of the definition's documents, or other. */
export const isUploadedAs = (definition: ProjectTypeDefinition | null, value: string) =>
  value === otherKind || (definition?.documents.some((document) => document.documentType === value) ?? false)

/** What a document upload tells the review about the file: the document it was uploaded as, and what it must show. */
export function purposeOf(document: ProjectDocument) {
  const shows = document.mustShow.length > 0 ? `, which must show: ${document.mustShow.join("; ")}` : ""
  return `Uploaded as the ${document.label.toLowerCase()}${shows}.`
}

/** What the review reads with a file uploaded as one of the definition's documents; null for any other file. */
export function uploadContext(definition: ProjectTypeDefinition | null, uploadedAs: string | null) {
  const document = definition?.documents.find((entry) => entry.documentType === uploadedAs)
  return document ? purposeOf(document) : null
}
