import { describe, expect, it } from "vitest"
import { answerReadings, answersFileId, answersSchema, emptyAnswers, withAnswersPage } from "./answers"
import type { ProjectTypeDefinition } from "./projectType"

const definition: ProjectTypeDefinition = {
  subjects: ["item"],
  groups: [
    {
      subject: "work",
      label: "The project",
      itemLabel: "The project",
      help: null,
      isRepeatable: false,
      fields: [
        {
          kind: "yes-no",
          property: "work.replaces-existing",
          label: "Replaces something",
          help: null,
          isRequired: true
        },
        { kind: "date", property: "work.starts-on", label: "Start date", help: null, isRequired: false }
      ]
    },
    {
      subject: "item",
      label: "Items",
      itemLabel: "Item",
      help: null,
      isRepeatable: true,
      fields: [
        {
          kind: "number",
          property: "item.height",
          label: "Height",
          help: null,
          isRequired: false,
          unit: { key: "inch", label: "inches" }
        },
        {
          kind: "choice",
          property: "item.color",
          label: "Color",
          help: null,
          isRequired: false,
          options: [{ value: "color.grey", label: "grey" }],
          allowsOther: false
        }
      ]
    }
  ],
  documents: []
}

const answers = {
  work: [{ "work.replaces-existing": true, "work.starts-on": "2026-11-01" }],
  item: [
    { "item.height": 72, "item.color": "color.grey" },
    { "item.height": null, "item.color": null }
  ]
}

describe("answersSchema", () => {
  it("accepts answers that fit the form and names what's missing or wrong by path", () => {
    expect(answersSchema(definition).safeParse(answers).success).toBe(true)
    const blank = answersSchema(definition).safeParse(emptyAnswers(definition))
    expect(blank.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [["work", 0, "work.replaces-existing"], 'Answer "Replaces something".']
    ])
    const wrong = answersSchema(definition).safeParse({
      ...answers,
      item: [{ "item.height": -1, "item.color": "color.unlisted" }]
    })
    expect(wrong.error?.issues.map((issue) => issue.path)).toEqual([
      ["item", 0, "item.height"],
      ["item", 0, "item.color"]
    ])
  })
})

describe("withAnswersPage", () => {
  it("adds the answers as the packet's first page, in words, item by item", () => {
    const packet = withAnswersPage({ files: [], images: [] }, { projectType: "A project type", definition, answers })
    expect(packet.files[0]?.id).toBe(answersFileId)
    expect(packet.files[0]?.pages[0]?.text).toBe(
      [
        "ANSWERS GIVEN IN THE APPLICATION FORM",
        "Project type: A project type",
        "The project",
        "Replaces something: Yes",
        "Start date: 2026-11-01",
        "Item 1",
        "Height: 72 inches",
        "Color: grey"
      ].join("\n")
    )
  })

  it("leaves a packet without answers as it is", () => {
    const packet = { files: [], images: [] }
    expect(withAnswersPage(packet, { projectType: null, definition: null, answers: null })).toBe(packet)
  })
})

describe("answerReadings", () => {
  it("reads the work's answers as facts of their properties, citing the answers page, and leaves items to the models", () => {
    const readings = answerReadings(
      definition,
      answers,
      [
        { id: "work-1", type: "work" },
        { id: "item-1", type: "item" }
      ],
      (key) => key
    )
    expect(readings).toEqual([
      {
        entity: "work-1",
        property: "work.replaces-existing",
        state: "known",
        stated: "Yes",
        reading: true,
        evidence: [{ fileId: answersFileId, page: 1, quote: "Replaces something: Yes" }],
        confidence: 0.95
      },
      {
        entity: "work-1",
        property: "work.starts-on",
        state: "known",
        stated: "2026-11-01",
        reading: "2026-11-01",
        evidence: [{ fileId: answersFileId, page: 1, quote: "Start date: 2026-11-01" }],
        confidence: 0.95
      }
    ])
  })
})
