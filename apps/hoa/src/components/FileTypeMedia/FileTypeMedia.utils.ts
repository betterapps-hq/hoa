// A file's type at a glance (the attachments in every file list): its extension, colored by the kind of file.

/** The kinds of file a list colors apart; the uploads accept PDFs, Word documents and photos. */
export type FileFamily = "pdf" | "word" | "image" | "other"

const families: Record<string, FileFamily> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  jpg: "image",
  jpeg: "image",
  png: "image"
}

/** What a file is, from its name, else its media type: the extension to show and the family that colors it. */
export function fileTypeOf(fileName: string, mediaType = "") {
  const dot = fileName.lastIndexOf(".")
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
  const family =
    families[extension] ??
    (mediaType === "application/pdf" ? "pdf" : null) ??
    (mediaType.startsWith("image/") ? "image" : null) ??
    "other"
  return { label: extension.slice(0, 4).toUpperCase() || "FILE", family }
}
