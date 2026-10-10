import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderInWorkspace, sampleRecords } from "@/tests/rulebookWorkspace"
import { QuestionsTab } from "./QuestionsTab"

const toast = vi.hoisted(() => ({
  error: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
  message: vi.fn<(message: string) => void>()
}))
vi.mock("sonner", () => ({ toast }))

const records = sampleRecords()
const [first] = records.questions

describe("QuestionsTab", () => {
  it("shows each question with its citations and the rules each reading keeps", () => {
    renderInWorkspace(<QuestionsTab />)
    expect(screen.getByText(/7 of 7 to answer/)).toBeInTheDocument()
    const readings = screen.getAllByRole("radiogroup", { name: "Readings" })[0]!
    expect(within(readings).getByText("Only the six-month minimum term")).toBeInTheDocument()
    const kept = screen.getByRole("list", { name: "Rules kept by: Only the six-month minimum term" })
    expect(
      within(kept).getByRole("button", { name: "Declarant's Units exempt from the minimum lease term" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Declaration 3.1(c), paragraph 2" }).length).toBeGreaterThan(0)
  })

  it("answers a question with a reading and a note", async () => {
    const { user, actions } = renderInWorkspace(<QuestionsTab />)
    const [card] = screen.getAllByRole("radiogroup", { name: "Readings" })
    await user.click(within(card!).getAllByRole("radio")[1]!)
    await user.type(screen.getAllByRole("textbox", { name: "Why (optional)" })[0]!, "The paragraph's own words.")
    await user.click(screen.getAllByRole("button", { name: "Answer" })[0]!)
    expect(actions?.answerQuestion).toHaveBeenCalledWith(first?.id, 1, "The paragraph's own words.")
    expect(toast.success).toHaveBeenCalledWith("Answered.")
  })

  it("shows an answer's chosen reading, and lets it change", async () => {
    const answered = {
      ...records,
      questions: records.questions.map((question, index) =>
        index === 0
          ? { ...question, answer: { option: 0, text: "As written.", by: "admin", at: "2026-10-09T00:00:00Z" } }
          : question
      )
    }
    const { user } = renderInWorkspace(<QuestionsTab />, { records: answered })
    expect(screen.getByText(/6 of 7 to answer/)).toBeInTheDocument()
    expect(screen.getByText("(chosen)")).toBeInTheDocument()
    expect(screen.getByText("Note: As written.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Change the answer" }))
    expect(screen.getAllByRole("radiogroup", { name: "Readings" })).toHaveLength(7)
  })
})
