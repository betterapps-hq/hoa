import { describe, expect, it } from "vitest"
import { gardenStructure } from "./applications.test-data"
import { documentStatuses, guessKind, kindProblem, kindsOf } from "./fileKinds"

const kinds = [
  { value: "plans", label: "Plans" },
  { value: "plot-plan", label: "Plot plan" },
  { value: "neighbor-form", label: "Neighbor approval form" },
  { value: "application-form", label: "Application form" },
  { value: "checklist", label: "Application checklist" },
  { value: "photo", label: "Photo" }
]

describe("guessKind", () => {
  it("picks the kind a file's name clearly points to", () => {
    expect(guessKind("Plot_Plan-final.pdf", kinds)).toBe("plot-plan")
    expect(guessKind("site plans.pdf", kinds)).toBe("plans")
    expect(guessKind("neighbor-approval.pdf", kinds)).toBe("neighbor-form")
    expect(guessKind("ApplicationForm.pdf", kinds)).toBe("application-form")
    expect(guessKind("photos.jpg", kinds)).toBe("photo")
  })

  it("guesses nothing from a name that points nowhere, or to two kinds as much", () => {
    expect(guessKind("IMG_0042.jpg", kinds)).toBe("")
    expect(guessKind("application.pdf", kinds)).toBe("")
    expect(guessKind("application form and checklist.pdf", kinds)).toBe("")
  })
})

describe("kindsOf", () => {
  it("offers each document the project type lists, then other", () => {
    expect(kindsOf(gardenStructure.definition)?.map((kind) => kind.label)).toEqual([
      "Site plan",
      "Photo",
      "Other or several documents"
    ])
    expect(kindsOf(null)).toBeNull()
  })
})

describe("documentStatuses", () => {
  it("names the files said to be each document", () => {
    const statuses = documentStatuses(gardenStructure.definition.documents, [
      { name: "plan.pdf", kind: "site-plan" },
      { name: "notes.pdf", kind: null }
    ])
    expect(statuses.map((status) => status.files)).toEqual([["plan.pdf"], []])
  })
})

describe("kindProblem", () => {
  const photo = { name: "yard.jpg", type: "image/jpeg", size: 10 }

  it("says when a document doesn't take a file's format", () => {
    expect(kindProblem(photo, gardenStructure.definition, "site-plan")).toBe(
      "The site plan takes PDF files; yard.jpg isn't one."
    )
  })

  it("finds nothing wrong with a format the document takes, or a document that takes any", () => {
    expect(
      kindProblem({ ...photo, name: "plan.pdf", type: "application/pdf" }, gardenStructure.definition, "site-plan")
    ).toBeNull()
    expect(kindProblem(photo, gardenStructure.definition, "photo")).toBeNull()
    expect(kindProblem(photo, null, "site-plan")).toBeNull()
  })
})
