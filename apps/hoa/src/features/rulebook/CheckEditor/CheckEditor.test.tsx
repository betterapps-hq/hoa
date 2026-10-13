import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { pickableTerms } from "@/rulebook/ruleTerms"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRecords } from "@/tests/rulebookWorkspace"
import { CheckEditor } from "./CheckEditor"

const records = sampleRecords()
const catalog = { vocabulary: createVocabulary(records.terms), terms: pickableTerms(records.terms) }

function setup(value: T.Check, subject = "lease-registration") {
  const onChange = vi.fn<(value: T.Check) => void>()
  render(<CheckEditor value={value} onChange={onChange} catalog={catalog} subject={subject} />)
  return { onChange, user: userEvent.setup() }
}

describe("CheckEditor", () => {
  it("edits a test's condition", async () => {
    const test: T.Check = {
      type: "test",
      test: {
        type: "compare",
        left: { type: "ref", path: ["lease-registration.term"] },
        op: ">=",
        right: { type: "number", value: 6 }
      }
    }
    const { onChange, user } = setup(test)
    await user.selectOptions(screen.getByRole("combobox", { name: "Complies when: comparison" }), ">")
    expect(onChange).toHaveBeenLastCalledWith({ type: "test", test: { ...test.test, op: ">" } })
  })

  it("edits a table's rows, cells and fallback", async () => {
    const table: T.Check = {
      type: "table",
      inputs: [{ type: "ref", path: ["lease-registration.premises"] }],
      rows: [{ when: [{ type: "any" }], result: "met", citation: null }],
      otherwise: "not-met"
    }
    const { onChange, user } = setup(table)
    await user.selectOptions(screen.getByRole("combobox", { name: /^Row 1, .+: kind$/ }), "in")
    expect(onChange).toHaveBeenLastCalledWith({
      ...table,
      rows: [{ when: [{ type: "in", values: [] }], result: "met", citation: null }]
    })
    await user.selectOptions(screen.getByRole("combobox", { name: "Row 1: result" }), "not-met")
    expect(onChange).toHaveBeenLastCalledWith({ ...table, rows: [{ ...table.rows[0], result: "not-met" }] })
    await user.click(screen.getByRole("button", { name: "Add a row" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...table, rows: [...table.rows, { ...table.rows[0], result: "met" }] })
    await user.click(screen.getByRole("button", { name: "Add an input" }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...table,
      inputs: [...table.inputs, { type: "ref", path: [] }],
      rows: [{ ...table.rows[0], when: [{ type: "any" }, { type: "any" }] }]
    })
    await user.selectOptions(screen.getByRole("combobox", { name: "When no row matches" }), "met")
    expect(onChange).toHaveBeenLastCalledWith({ ...table, otherwise: "met" })
  })

  it("edits a document check: what it states and who signs", async () => {
    const document: T.Check = {
      type: "document",
      document: "lease",
      per: "request",
      mustState: ["the term"],
      signedBy: ["owner"]
    }
    const { onChange, user } = setup(document)
    expect(screen.getByRole("combobox", { name: "Document" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add a statement" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...document, mustState: ["the term", ""] })
    await user.click(screen.getByRole("button", { name: "Remove Owner" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...document, signedBy: [] })
    await user.selectOptions(screen.getByRole("combobox", { name: "One for" }), "subject")
    expect(onChange).toHaveBeenLastCalledWith({ ...document, per: "subject" })
  })

  it("edits an approval check: who approves, how many, and how", async () => {
    const approval: T.Check = { type: "approval", by: ["committee", "board"], needs: "all", prior: true, written: true }
    const { onChange, user } = setup(approval, "work")
    await user.selectOptions(screen.getByRole("combobox", { name: "Approvals needed" }), "any")
    expect(onChange).toHaveBeenLastCalledWith({ ...approval, needs: "any" })
    await user.click(screen.getByRole("checkbox", { name: "In writing" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...approval, written: false })
    await user.click(screen.getByRole("button", { name: "Remove Board of Directors" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...approval, by: ["committee"] })
  })

  it("edits a judgment's question, and starts a new check when the kind changes", async () => {
    const judgment: T.Check = { type: "judgment", question: "Is it in harmony?", evidence: [] }
    const { onChange, user } = setup(judgment)
    await user.type(screen.getByRole("textbox", { name: "Question, phrased so that yes complies" }), "!")
    expect(onChange).toHaveBeenLastCalledWith({ ...judgment, question: "Is it in harmony?!" })
    await user.selectOptions(screen.getByRole("combobox", { name: "Check: kind" }), "approval")
    expect(onChange).toHaveBeenLastCalledWith({ type: "approval", by: [], needs: "all", prior: true, written: true })
  })

  it("shows a deadline in words, to be edited as JSON", () => {
    setup({
      type: "deadline",
      act: { type: "ref", path: ["lease-registration.term"] },
      anchor: { type: "governing-date" },
      earliest: null,
      latest: { value: 30, unit: "calendar-day", at: null },
      onMiss: []
    })
    expect(screen.getByText(/edit this check as JSON/)).toBeInTheDocument()
  })
})
