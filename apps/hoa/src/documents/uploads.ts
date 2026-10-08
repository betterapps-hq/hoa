export const maxUploadBytes = 30 * 1024 * 1024

const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export type UploadKind = "pdf" | "image" | "docx"

/** File types each upload field accepts, for the file input's `accept` attribute. */
export const acceptedTypes = {
  governingDocuments: ".pdf,application/pdf",
  application: [
    ".pdf",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    "application/pdf",
    docxType,
    ...imageTypes
  ].join(",")
}

/** Classifies an upload by media type, falling back to the extension when the browser sends a generic type. */
export function classifyUpload(file: { name: string; type: string }): UploadKind | undefined {
  const extension = file.name.toLowerCase().split(".").pop()
  if (file.type === "application/pdf" || extension === "pdf") {
    return "pdf"
  }
  if (file.type === docxType || extension === "docx") {
    return "docx"
  }
  if (imageTypes.includes(file.type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension ?? "")) {
    return "image"
  }
  return undefined
}

export function describeFiles(files: { name: string }[]) {
  return files.map((file, index) => `${index + 1}. ${file.name}`).join("; ")
}
