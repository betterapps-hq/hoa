import { unzipSync } from "fflate"

export type WordPicture = {
  /** Position among the document's pictures, from 1. */
  ordinal: number
  fileName: string
  mediaType: "image/png" | "image/jpeg" | null
  data: Uint8Array
  /** The paragraph that says what the picture shows: its own text, or the paragraph before it. */
  contextText: string | null
}

const mediaTypes: Record<string, "image/png" | "image/jpeg"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg"
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

/**
 * Pulls the pictures out of a Word file in document order (docs/design/ocr.md, "Word files"). Layout ignores them, and
 * the paragraph next to each one is what says what it shows ("Here's a photo of the gate we'll install"). Formats the
 * review model can't read (EMF and WMF drawings) come back with a null media type.
 */
export function extractWordPictures(docx: Uint8Array): WordPicture[] {
  const files = unzipSync(docx, { filter: (file) => file.name.startsWith("word/") })
  const decoder = new TextDecoder()
  const documentXml = files["word/document.xml"]
  const relationshipsXml = files["word/_rels/document.xml.rels"]
  if (!documentXml || !relationshipsXml) {
    return []
  }
  const targets = new Map<string, string>()
  for (const match of decoder.decode(relationshipsXml).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1]
    if (id && target) {
      targets.set(id, target)
    }
  }

  const pictures: WordPicture[] = []
  let previousText: string | null = null
  for (const paragraph of decoder.decode(documentXml).matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const xml = paragraph[0]
    const text = decodeXml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((run) => run[1]).join("")).trim()
    for (const blip of xml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)) {
      const target = targets.get(blip[1] ?? "")
      const data = target ? files[`word/${target.replace(/^\.?\//, "")}`] : undefined
      if (!target || !data) {
        continue
      }
      const fileName = target.split("/").pop() ?? target
      pictures.push({
        ordinal: pictures.length + 1,
        fileName,
        mediaType: mediaTypes[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? null,
        data,
        contextText: text || previousText
      })
    }
    if (text) {
      previousText = text
    }
  }
  return pictures
}
