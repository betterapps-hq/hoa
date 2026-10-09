import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRecords } from "@/tests/rulebookWorkspace"
import { Statement } from "./Statement"

const vocabulary = createVocabulary(sampleRecords().terms)

describe("Statement", () => {
  it("renders term links as chips with the terms' current labels", () => {
    render(<Statement text="Each {{lot}} and its {{lot:plural}} neighbors." vocabulary={vocabulary} />)
    expect(screen.getByRole("button", { name: "Unit" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Units" })).toBeInTheDocument()
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
  })
})
