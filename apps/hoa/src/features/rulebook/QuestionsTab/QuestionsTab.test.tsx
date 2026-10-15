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
const [first, second] = records.questions

describe("QuestionsTab", () => {
  it("asks the open questions one at a time, each reading saying the rules it keeps", () => {
    renderInWorkspace(<QuestionsTab />)
    expect(screen.getByText(/15 of 15 to answer/)).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Questionnaire progress" })).toHaveTextContent("Question 1 of 15")
    const step = screen.getByRole("group", { name: first?.question })
    expect(within(step).getByRole("radio", { name: /Only the six-month minimum term/ })).toBeInTheDocument()
    expect(within(step).getByText("Keeps: Declarant's Units exempt from the minimum lease term")).toBeInTheDocument()
    expect(within(step).getAllByRole("link", { name: "Declaration 3.1(c), paragraph 2" }).length).toBeGreaterThan(0)
    expect(screen.queryByRole("group", { name: second?.question })).not.toBeInTheDocument()
  })

  it("saves a reading and a note on the way to the next question", async () => {
    const { user, actions } = renderInWorkspace(<QuestionsTab />)
    const step = screen.getByRole("group", { name: first?.question })
    await user.click(within(step).getAllByRole("radio")[1]!)
    await user.type(within(step).getByRole("textbox", { name: "Why (optional)" }), "The paragraph's own words.")
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(actions?.answerQuestion).toHaveBeenCalledWith(first?.id, 1, "The paragraph's own words.")
    expect(screen.getByRole("group", { name: second?.question })).toBeInTheDocument()
    expect(screen.getByText("Question 2 of 15")).toBeInTheDocument()
  })

  it("asks for a reading before moving on, and skipping leaves the question open", async () => {
    const { user, actions } = renderInWorkspace(<QuestionsTab />)
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an answer or skip this question.")
    await user.click(screen.getByRole("button", { name: "Skip" }))
    expect(screen.getByRole("group", { name: second?.question })).toBeInTheDocument()
    expect(actions?.answerQuestion).not.toHaveBeenCalled()
  })

  it("saves the last question when finishing", async () => {
    const one = { ...records, questions: records.questions.slice(0, 1) }
    const { user, actions } = renderInWorkspace(<QuestionsTab />, { records: one })
    await user.click(screen.getAllByRole("radio")[0]!)
    await user.click(screen.getByRole("button", { name: "Finish" }))
    expect(actions?.answerQuestion).toHaveBeenCalledWith(first?.id, 0, null)
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
    expect(screen.getByText(/14 of 15 to answer/)).toBeInTheDocument()
    expect(screen.getByText("Question 1 of 14")).toBeInTheDocument()
    expect(screen.getByText("Your answer")).toBeInTheDocument()
    expect(screen.getByText("As written.")).toBeInTheDocument()
    expect(screen.getAllByText("Not chosen").length).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "Change the answer" }))
    expect(screen.getByRole("radiogroup", { name: "Readings" })).toBeInTheDocument()
  })
})
