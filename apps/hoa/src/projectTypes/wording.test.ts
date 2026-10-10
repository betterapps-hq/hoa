import { describe, expect, it } from "vitest"
import type { ProjectField } from "./projectType"
import { asSentence, exampleOf, fallbackQuestion } from "./wording"

describe("fallbackQuestion", () => {
  it("asks for a detail named by a noun, about the thing it describes", () => {
    expect(fallbackQuestion("height", "number", "fence run")).toBe("What is the fence run's height?")
    expect(fallbackQuestion("The finish", "choice", "panel")).toBe("What is the panel's finish?")
    expect(fallbackQuestion("kind of Work", "choice", "project")).toBe("What kind of work is it?")
    expect(fallbackQuestion("Lot Width", "number", "lot")).toBe("What is the lot's width?")
    expect(fallbackQuestion("gate arbor height", "number", "gate")).toBe("What is the gate's arbor height?")
    expect(fallbackQuestion("gateway width", "number", "gate")).toBe("What is the gate's gateway width?")
    expect(fallbackQuestion("HOA approval date", "text", "project")).toBe("What is the project's HOA approval date?")
    expect(fallbackQuestion("color", "choice", "gates")).toBe("What is the gates' color?")
  })

  it("asks whether a state holds of the thing for a yes or no named by a participle", () => {
    expect(fallbackQuestion("approved by the Board", "yes-no", "project")).toBe("Is the project approved by the board?")
    expect(fallbackQuestion("corner lot", "yes-no", "lot")).toBe("Corner lot?")
    expect(fallbackQuestion("open metal view", "yes-no", "fence run")).toBe("Open metal view?")
  })

  it("asks for the date something happened, and keeps a label it can't rephrase as a question", () => {
    expect(fallbackQuestion("construction commenced on", "date", "project")).toBe(
      "What is the date construction commenced?"
    )
    expect(fallbackQuestion("boundary with", "choice", "fence run")).toBe("Boundary with?")
    expect(fallbackQuestion("approved by resolution.", "text", "project")).toBe("Approved by resolution?")
  })
})

describe("asSentence", () => {
  it("capitalizes help and ends it with a period", () => {
    expect(asSentence("the activity is one the Board approves")).toBe("The activity is one the Board approves.")
    expect(asSentence("Measured from the ground.")).toBe("Measured from the ground.")
  })
})

describe("exampleOf", () => {
  const base = { property: "p", binding: null, label: "Q?", help: null, isRequired: false, citations: [] }
  it("shows an example only in boxes answered in words", () => {
    const text: ProjectField = { ...base, kind: "text", example: "Cedar", answeredBy: "applicant" }
    const date: ProjectField = { ...base, kind: "date", example: "May 1, 2027", answeredBy: "applicant" }
    expect(exampleOf(text)).toBe("Cedar")
    expect(exampleOf(date)).toBeNull()
  })
})
