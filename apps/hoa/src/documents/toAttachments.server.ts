import mammoth from "mammoth"
import { match } from "ts-pattern"
import type { PromptAttachment } from "@/ai/runPrompt"
import { classifyUpload, maxUploadBytes } from "./uploads"

export class UploadError extends Error {}

/** Reads uploaded files into model attachments: PDFs and images as files, Word documents as text plus their images. */
export async function toAttachments(files: File[]): Promise<PromptAttachment[]> {
  const attachments: PromptAttachment[] = []
  for (const file of files) {
    if (file.size > maxUploadBytes) {
      throw new UploadError(`${file.name} is larger than 30 MB.`)
    }
    const kind = classifyUpload(file)
    if (!kind) {
      throw new UploadError(`${file.name} isn't a PDF, Word document or image.`)
    }
    const data = new Uint8Array(await file.arrayBuffer())
    attachments.push(
      ...(await match(kind)
        .with("pdf", () => [{ type: "file" as const, filename: file.name, mediaType: "application/pdf", data }])
        .with("image", () => [
          { type: "file" as const, filename: file.name, mediaType: file.type || "image/png", data }
        ])
        .with("docx", () => fromDocx(file.name, data))
        .exhaustive())
    )
  }
  return attachments
}

async function fromDocx(filename: string, data: Uint8Array): Promise<PromptAttachment[]> {
  const buffer = Buffer.from(data)
  const images: PromptAttachment[] = []
  const { value: text } = await mammoth.extractRawText({ buffer })
  await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        images.push({
          type: "file",
          filename: `${filename} image ${images.length + 1}`,
          mediaType: image.contentType,
          data: new Uint8Array(await image.readAsBuffer())
        })
        return { src: "" }
      })
    }
  )
  return [{ type: "text", text: `Text of ${filename}:\n${text.trim()}` }, ...images]
}

export function filesFromFormData(formData: FormData, field: string) {
  return formData.getAll(field).filter((entry): entry is File => entry instanceof File && entry.size > 0)
}
