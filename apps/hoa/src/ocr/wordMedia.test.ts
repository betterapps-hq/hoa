import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { extractWordPictures } from "./wordMedia"

function paragraph(text: string, embed?: string) {
  const picture = embed ? `<w:r><w:drawing><a:graphic><a:blip r:embed="${embed}"/></a:graphic></w:drawing></w:r>` : ""
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r>${picture}</w:p>`
}

function docx(body: string, relationships: string) {
  return zipSync({
    "word/document.xml": strToU8(`<w:document><w:body>${body}</w:body></w:document>`),
    "word/_rels/document.xml.rels": strToU8(`<Relationships>${relationships}</Relationships>`),
    "word/media/image1.png": new Uint8Array([1]),
    "word/media/image2.jpeg": new Uint8Array([2]),
    "word/media/image3.emf": new Uint8Array([3])
  })
}

describe("extractWordPictures", () => {
  it("returns pictures in document order with the paragraph that describes them", () => {
    const file = docx(
      [
        paragraph("Copy of the new fence is attached"),
        paragraph("", "rId9"),
        paragraph("Here&apos;s a photo of the gate", "rId5"),
        paragraph("A drawing", "rId7")
      ].join(""),
      [
        '<Relationship Id="rId5" Type="image" Target="media/image1.png"/>',
        '<Relationship Id="rId9" Type="image" Target="media/image2.jpeg"/>',
        '<Relationship Id="rId7" Type="image" Target="media/image3.emf"/>'
      ].join("")
    )
    const pictures = extractWordPictures(file)
    expect(pictures.map(({ data: _data, ...picture }) => picture)).toEqual([
      {
        ordinal: 1,
        fileName: "image2.jpeg",
        mediaType: "image/jpeg",
        contextText: "Copy of the new fence is attached"
      },
      { ordinal: 2, fileName: "image1.png", mediaType: "image/png", contextText: "Here's a photo of the gate" },
      { ordinal: 3, fileName: "image3.emf", mediaType: null, contextText: "A drawing" }
    ])
    expect(pictures[0]?.data).toEqual(new Uint8Array([2]))
  })

  it("returns nothing for a file without a document body", () => {
    expect(extractWordPictures(zipSync({ "word/other.xml": strToU8("<x/>") }))).toEqual([])
  })
})
