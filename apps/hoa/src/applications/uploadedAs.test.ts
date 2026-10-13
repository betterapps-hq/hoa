import { describe, expect, it } from "vitest"
import { gardenStructure } from "@/features/applications/applications.test-data"
import { isUploadedAs, otherKind, uploadContext } from "./uploadedAs"

const { definition } = gardenStructure

describe("isUploadedAs", () => {
  it("takes the project type's documents and other, and nothing else", () => {
    expect(isUploadedAs(definition, "site-plan")).toBe(true)
    expect(isUploadedAs(definition, otherKind)).toBe(true)
    expect(isUploadedAs(definition, "survey")).toBe(false)
    expect(isUploadedAs(null, "site-plan")).toBe(false)
    expect(isUploadedAs(null, otherKind)).toBe(true)
  })
})

describe("uploadContext", () => {
  it("tells the review which document a file is and what it must show", () => {
    expect(uploadContext(definition, "site-plan")).toBe(
      "Uploaded as the site plan, which must show: where the structure goes."
    )
    expect(uploadContext(definition, "photo")).toBe("Uploaded as the photo.")
  })

  it("says nothing of a file that's other, not said, or without a project type", () => {
    expect(uploadContext(definition, otherKind)).toBeNull()
    expect(uploadContext(definition, null)).toBeNull()
    expect(uploadContext(null, "site-plan")).toBeNull()
  })
})
