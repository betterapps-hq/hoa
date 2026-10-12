import { describe, expect, it } from "vitest"
import { guessKind, listNames } from "./ApplicationsPage.utils"

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

describe("listNames", () => {
  it("joins names in a sentence", () => {
    expect(listNames(["a"])).toBe("a")
    expect(listNames(["a", "b", "c"])).toBe("a, b and c")
  })
})
