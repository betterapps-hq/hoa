import { describe, expect, it } from "vitest"
import {
  answerErrors,
  answerLines,
  answerReadings,
  answersFileId,
  answersSchema,
  emptyAnswers,
  withAnswersPage
} from "./answers"
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
          binding: "work.replaces-existing",
          label: "Replaces something",
          help: null,
          isRequired: true,
          example: null,
          answeredBy: "applicant",
          citations: []
        },
        {
          kind: "date",
          property: "work.starts-on",
          binding: "work.starts-on",
          label: "Start date",
          help: null,
          isRequired: false,
          example: null,
          answeredBy: "applicant",
          citations: []
        }
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
          binding: "item.height",
          label: "Height",
          help: null,
          isRequired: false,
          example: null,
          answeredBy: "applicant",
          citations: [],
          unit: { key: "inch", label: "inches" },
          dimension: "length",
          units: []
        },
        {
          kind: "choice",
          property: "item.color",
          binding: "item.color",
          label: "Color",
          help: null,
          isRequired: false,
          example: null,
          answeredBy: "applicant",
          citations: [],
          options: [{ value: "color.grey", label: "grey" }],
          allowsOther: false
        }
      ]
    }
  ],
  documents: [],
  formDocuments: [],
  unasked: []
}

const answers = {
  work: [{ "work.replaces-existing": true, "work.starts-on": "2026-11-01" }],
  item: [
    { "item.height": 72, "item.color": "color.grey" },
    { "item.height": null, "item.color": null }
  ]
}

describe("answerErrors", () => {
  it("says how to fix an amount the form couldn't read, and asks for a required answer", () => {
    const height = definition.groups[1]!.fields[0]!
    expect(answerErrors(height, 72)).toEqual([])
    expect(answerErrors(height, "tall")).toEqual(["Use numbers only, such as 6 or 5.5."])
    expect(answerErrors(definition.groups[0]!.fields[0]!, null)).toEqual(["Answer this question."])
  })
})

describe("answerLines", () => {
  it("writes a question's answer after it, and a label's after a colon", () => {
    const worded = {
      ...definition,
      groups: [
        {
          ...definition.groups[0]!,
          fields: [{ ...definition.groups[0]!.fields[0]!, label: "Does it replace something?" }]
        }
      ]
    }
    expect(answerLines(worded, answers)[0]!.lines.map((item) => item.line)).toEqual(["Does it replace something? Yes"])
    expect(answerLines(definition, answers)[0]!.lines.map((item) => item.line)).toEqual([
      "Replaces something: Yes",
      "Start date: 2026-11-01"
    ])
  })
})

describe("answersSchema", () => {
  it("accepts answers that fit the form and names what's missing or wrong by path", () => {
    expect(answersSchema(definition).safeParse(answers).success).toBe(true)
    const blank = answersSchema(definition).safeParse(emptyAnswers(definition))
    expect(blank.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [["work", 0, "work.replaces-existing"], "Answer this question."]
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

describe("the administrator's own questions", () => {
  const own = {
    property: "custom.reason",
    binding: null,
    label: "Why now?",
    help: null,
    example: null,
    isRequired: false,
    answeredBy: "applicant" as const,
    citations: []
  }
  const withOwn: ProjectTypeDefinition = {
    ...definition,
    groups: [
      {
        ...definition.groups[0]!,
        fields: [
          ...definition.groups[0]!.fields,
          { ...own, kind: "long-text" },
          {
            ...own,
            property: "custom.extras",
            label: "What else is included?",
            kind: "choices",
            options: [
              { value: "lights", label: "Lights" },
              { value: "planter", label: "Planter" }
            ]
          }
        ]
      },
      definition.groups[1]!
    ]
  }
  const ownAnswers = {
    ...answers,
    work: [{ ...answers.work[0], "custom.reason": "Storm damage", "custom.extras": ["lights", "planter"] }]
  }

  it("puts their answers on the answers page, which the review and the committee read", () => {
    expect(answersSchema(withOwn).safeParse(ownAnswers).success).toBe(true)
    const lines = answerLines(withOwn, ownAnswers)[0]!.lines.map((item) => item.line)
    expect(lines).toContain("Why now? Storm damage")
    expect(lines).toContain("What else is included? Lights; Planter")
  })

  it("never reads them as facts of a property", () => {
    const readings = answerReadings(withOwn, ownAnswers, [{ id: "work-1", type: "work" }], (key) => key)
    expect(readings.map((reading) => reading.property)).toEqual(["work.replaces-existing", "work.starts-on"])
  })
})
