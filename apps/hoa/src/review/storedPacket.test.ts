import { describe, expect, it } from "vitest"
import { pageOf, toPacket, type PacketFixture } from "@/evaluation/review/packetFixture"
import { imagesFor, packetPageTexts, pagesForPrompt, type Packet } from "./packet"
import { loadPacket, type StoredFile } from "./storedPacket"

// Parity between the app and evaluation (implementation-log.md, Round 2): the packet the ApplicationReview Workflow
// loads from what its OCR stored must read, to the models, exactly like the packet `pnpm eval:review` builds from an
// OCR fixture of the same files.

const visual = (figureId: string, description: string) => ({ figureId, pageIndex: 1, description, measurements: [] })

const fixture: PacketFixture = {
  files: [
    {
      id: "form",
      fileName: "form.pdf",
      mediaType: "application/pdf",
      contextText: null,
      isReadable: true,
      pages: [{ text: "Application form. Fence height: 6 feet." }],
      visuals: [visual("1.1", "A site plan with the fence drawn in red.")],
      images: [{ pageIndex: 1, path: "images/form-1.1.png", mediaType: "image/png" }]
    },
    {
      id: "appendix",
      fileName: "appendix.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      contextText: null,
      isReadable: true,
      pages: [{ text: "Copy of the new fence is attached." }],
      visuals: [],
      images: []
    },
    {
      id: "appendix-p1",
      fileName: "picture-1.png",
      mediaType: "image/png",
      contextText: "Copy of the new fence is attached",
      isReadable: true,
      pages: [{ text: "" }],
      visuals: [visual("image", "A fence of horizontal boards.")],
      images: [{ pageIndex: 1, path: "images/appendix-p1.png", mediaType: "image/png" }]
    }
  ]
}

/** The fixture as the Workflow's OCR stores it: page records, descriptions and images under each file's keys. */
function stored() {
  const objects = new Map<string, string>()
  const files: StoredFile[] = fixture.files.map((file) => {
    for (const item of file.visuals) {
      objects.set(`${file.id}/figures/${item.figureId}.json`, JSON.stringify({ ...item, promptVersion: 2 }))
    }
    for (const image of file.images) {
      objects.set(image.path, "image bytes")
    }
    return {
      id: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      contextText: file.contextText,
      status: "ready",
      pageCount: file.pages.length
    }
  })
  const bucket = {
    get: async (key: string) => {
      const value = objects.get(key)
      return value === undefined
        ? null
        : { text: async () => value, arrayBuffer: async () => new TextEncoder().encode(value).buffer }
    }
  }
  const pagesOf = async (file: StoredFile) =>
    (fixture.files.find((item) => item.id === file.id)?.pages ?? []).map((page, index) => ({
      ...pageOf(file.id, index + 1, page.text),
      // A PDF page lists the figures OCR cropped from it; an image file's one page lists none.
      figures:
        file.mediaType === "application/pdf" ? [{ id: "1.1", caption: null, imageKey: "images/form-1.1.png" }] : []
    }))
  const keysOf = (file: StoredFile) => ({
    source: `images/${file.id}.png`,
    figureImage: (figureId: string) => `images/${file.id}-${figureId}.png`,
    figureDescription: (figureId: string) => `${file.id}/figures/${figureId}.json`
  })
  return loadPacket(bucket, files, keysOf, pagesOf)
}

/** What the models read of a packet: the pages with their markers, the evidence texts and the images sent. */
async function asRead(packet: Packet) {
  const texts = packetPageTexts(packet)
  return {
    pages: pagesForPrompt(packet, new Map()),
    evidence: packet.files.map((file) => texts(file.id, 1)),
    images: await Promise.all(
      imagesFor(packet).map(async ({ fileId, pageIndex, filename, mediaType, load }) => ({
        fileId,
        pageIndex,
        filename,
        mediaType,
        data: new TextDecoder().decode(await load())
      }))
    )
  }
}

describe("the stored packet", () => {
  it("reads to the models exactly like the evaluation's packet of the same files", async () => {
    const fromFixture = toPacket(fixture, async () => new TextEncoder().encode("image bytes"))
    expect(await asRead(await stored())).toEqual(await asRead(fromFixture))
    expect((await asRead(fromFixture)).images.map((image) => image.filename)).toEqual(["form-1.1.png", "picture-1.png"])
  })
})
