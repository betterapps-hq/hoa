// What each upload accepts (docs/design/documents.md, "Uploads"). Images are limited to what the review model reads.

const megabyte = 1024 * 1024
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export type UploadTarget = "governing" | "application"
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
  application: { pdf: 25 * megabyte, docx: 25 * megabyte, image: 5 * megabyte }
}

/** The file input's `accept` attribute for each target. */
export const acceptFor: Record<UploadTarget, string> = {
  governing: ".pdf,.docx,application/pdf," + docxType,
  application: ".pdf,.docx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg," + docxType
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
    const allowed = target === "governing" ? "PDF or Word" : "PDF, Word, JPEG or PNG"
    const imageHint =
      /^(heic|heif|tif|tiff|bmp|webp|gif)$/.test(extension) || file.type.startsWith("image/")
        ? " Save photos as JPEG or PNG."
        : ""
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
