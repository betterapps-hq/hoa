import type { Email } from "@/auth/email.server"
import { dayText } from "@/lib/days"

// The notice of a violation (docs/design/violations.md, Steps 2): what was seen, the rules it breaks with where the
// documents say so, the time to cure, and how to reply or ask for a hearing.

export type NoticeRule = { title: string; citation: string; statement: string }

export type NoticeInput = {
  to: string
  name: string
  association: string
  unit: string
  title: string
  description: string | null
  observedOn: string
  rules: readonly NoticeRule[]
  /** The last day to cure, counted from this notice; null when there's no time to cure. */
  cureEndsOn: string | null
  link: string
}

const escaped = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

export function violationNoticeEmail(input: NoticeInput): Email {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,"
  const lead = `${input.association} found a violation at ${input.unit}, seen on ${dayText(input.observedOn)}: ${input.title}.`
  const rules = input.rules.map((rule) => `${rule.title} (${rule.citation}): ${rule.statement}`)
  const cure = input.cureEndsOn
    ? `Please correct it by ${dayText(input.cureEndsOn)}. A violation corrected in time isn't fined.`
    : "The documents give no time to correct it."
  const reply = "You can reply, or ask for a hearing before the board, from the violation's page:"
  const breaks = input.rules.length === 1 ? "The rule it breaks:" : "The rules it breaks:"
  const text = [
    greeting,
    lead,
    ...(input.description ? [input.description] : []),
    `${breaks}\n${rules.map((rule) => `- ${rule}`).join("\n")}`,
    cure,
    `${reply}\n${input.link}`
  ].join("\n\n")
  const html = [
    `<p>${escaped(greeting)}</p>`,
    `<p>${escaped(lead)}</p>`,
    ...(input.description ? [`<p>${escaped(input.description)}</p>`] : []),
    `<p>${breaks}</p><ul>${input.rules
      .map(
        (rule) =>
          `<li><strong>${escaped(rule.title)}</strong> (${escaped(rule.citation)}): ${escaped(rule.statement)}</li>`
      )
      .join("")}</ul>`,
    `<p>${escaped(cure)}</p>`,
    `<p>${escaped(reply)} <a href="${escaped(input.link)}">Open the violation</a></p>`
  ].join("")
  return { to: input.to, subject: `Notice of a violation at ${input.unit}`, text, html }
}
