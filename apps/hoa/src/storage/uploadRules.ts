// What each upload accepts (docs/design/documents.md, "Uploads"). Images are limited to what the review model reads.

const megabyte = 1024 * 1024
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export type UploadTarget = "governing" | "application" | "template" | "photo"
const uploadFormats = ["pdf", "docx", "image"] as const
export type UploadFormat = (typeof uploadFormats)[number]

const formats: Record<
  UploadFormat,
  { mediaType: (type: string) => string; extensions: readonly string[]; types: readonly string[] }
> = {
  pdf: { mediaType: () => "application/pdf", extensions: ["pdf"], types: ["application/pdf"] },
  docx: { mediaType: () => docxType, extensions: ["docx"], types: [docxType] },
  image: {
    mediaType: (type) => (type === "image/png" ? "image/png" : "image/jpeg"),
    extensions: ["png", "jpg", "jpeg"],
    types: ["image/png", "image/jpeg"]
  }
}

const limits: Record<UploadTarget, Partial<Record<UploadFormat, number>>> = {
  governing: { pdf: 50 * megabyte, docx: 50 * megabyte },
  application: { pdf: 25 * megabyte, docx: 25 * megabyte, image: 5 * megabyte },
  /** A form a project type gives homeowners to fill in. */
  template: { pdf: 10 * megabyte, docx: 10 * megabyte },
  /** A violation's photo, as a phone takes it. */
  photo: { image: 15 * megabyte }
}

/** The media types and extensions a target accepts, as a file picker's filter: { "application/pdf": [".pdf"] }. */
export function acceptedTypes(target: UploadTarget): Record<string, string[]> {
  return Object.fromEntries(
    uploadFormats
      .filter((format) => limits[target][format] !== undefined)
      .flatMap((format) =>
        formats[format].types.map((type) => [type, formats[format].extensions.map((extension) => `.${extension}`)])
      )
  )
}

/** A target's rules as UploadCN checks files: the types and extensions it takes, and the app's own check. */
export function uploadValidation(target: UploadTarget) {
  return {
    accept: Object.entries(acceptedTypes(target)).flatMap(([type, extensions]) => [type, ...extensions]),
    validate: (file: File) => {
      const validation = validateUpload(file, target)
      return validation.isValid ? null : validation.message
    }
  }
}

const formatNames: Record<UploadFormat, string> = { pdf: "PDF", docx: "Word", image: "JPEG or PNG" }

/** What a target accepts, in words: "PDF or Word up to 25 MB, JPEG or PNG up to 5 MB." */
export function uploadHint(target: UploadTarget) {
  const bySize = Map.groupBy(
    uploadFormats.filter((format) => limits[target][format] !== undefined),
    (format) => limits[target][format] ?? 0
  )
  const parts = [...bySize].map(([limit, group]) => {
    const names = group.map((format) => formatNames[format])
    const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : (names[0] ?? "")
    return `${listed} up to ${limit / megabyte} MB`
  })
  return `${parts.join(", ")}.`
}

export type ValidatedUpload = { format: UploadFormat; mediaType: string }

/** Checks a file's type and size for a target; the message says what to do instead. */
export function validateUpload(
  file: { name: string; type: string; size: number },
  target: UploadTarget
): { isValid: true; upload: ValidatedUpload } | { isValid: false; message: string } {
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  const format = uploadFormats.find(
    (candidate) => formats[candidate].types.includes(file.type) || formats[candidate].extensions.includes(extension)
  )
  const limit = format ? limits[target][format] : undefined
  if (!format || limit === undefined) {
    const allowed = target === "application" ? "PDF, Word, JPEG or PNG" : "PDF or Word"
    const isImage = /^(heic|heif|tif|tiff|bmp|webp|gif|png|jpe?g)$/.test(extension) || file.type.startsWith("image/")
    // Where photos are taken, say which; where they aren't, say what the file can be instead.
    const photoHint = limits[target].image === undefined ? " Save it as a PDF." : " Save photos as JPEG or PNG."
    const imageHint = isImage ? photoHint : ""
    return { isValid: false, message: `${file.name} isn't a ${allowed} file.${imageHint}` }
  }
  if (file.size > limit) {
    return { isValid: false, message: `${file.name} is larger than ${limit / megabyte} MB.` }
  }
  if (file.size === 0) {
    return { isValid: false, message: `${file.name} is empty.` }
  }
  return { isValid: true, upload: { format, mediaType: formats[format].mediaType(file.type) } }
}
