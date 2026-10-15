import { describe, expect, it } from "vitest"
import { violationNoticeEmail, type NoticeInput } from "./notice"

const input: NoticeInput = {
  to: "jordan@example.com",
  name: "Jordan Avery",
  association: "Sudden Valley Community Association",
  unit: "12 Lakeview Drive",
  title: "Garbage cans visible from the street",
  description: null,
  observedOn: "2026-10-14",
  rules: [
    {
      title: "Garbage cans screened from view",
      citation: "Guidelines 5.11.1",
      statement: "Garbage cans must be screened so they aren't visible from the street."
    }
  ],
  cureEndsOn: "2026-11-01",
  link: "https://example.com/violations/violation-1"
}

describe("the notice of a violation", () => {
  it("names the rule it breaks, the day to correct it by, and how to reply", () => {
    const email = violationNoticeEmail(input)
    expect(email.subject).toBe("Notice of a violation at 12 Lakeview Drive")
    expect(email.text).toContain("The rule it breaks:\n- Garbage cans screened from view (Guidelines 5.11.1)")
    expect(email.text).toContain("Please correct it by Nov 1, 2026.")
    expect(email.text).toContain(input.link)
  })

  it("says when the documents give no time to correct it, and escapes what was written", () => {
    const email = violationNoticeEmail({ ...input, cureEndsOn: null, description: "Cans <left> out & open" })
    expect(email.text).toContain("The documents give no time to correct it.")
    expect(email.html).toContain("Cans &lt;left&gt; out &amp; open")
    expect(email.html).not.toContain("<left>")
  })
})
