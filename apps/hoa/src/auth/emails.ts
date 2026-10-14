import type { Email } from "./email.server"

/** What a code is for, as Better Auth's email code plugin names it. */
export type CodePurpose = "sign-in" | "email-verification" | "forget-password" | "change-email"

const codeWords: Record<CodePurpose, { subject: string; lead: string }> = {
  "sign-in": { subject: "Your sign-in code", lead: "Enter this code to sign in:" },
  "email-verification": { subject: "Confirm your email", lead: "Enter this code to confirm your email:" },
  "forget-password": { subject: "Reset your password", lead: "Enter this code to choose a new password:" },
  "change-email": { subject: "Confirm your new email", lead: "Enter this code to confirm your new email:" }
}

const escaped = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

/** A one-time code by email: what it's for, the code, and when it expires. */
export function codeEmail(to: string, code: string, purpose: CodePurpose, minutes: number): Email {
  const { subject, lead } = codeWords[purpose]
  const expiry = `It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`
  return {
    to,
    subject: `${subject}: ${code}`,
    text: `${lead}\n\n${code}\n\n${expiry}`,
    html: `<p>${lead}</p><p style="font-size:24px;font-weight:600;letter-spacing:4px">${escaped(code)}</p><p>${expiry}</p>`
  }
}

/** An administrator's invitation to sign in: which association, and how to sign in with this email. */
export function invitationEmail(
  to: string,
  name: string,
  organizationName: string,
  signInUrl: string,
  asAdministrator = false
): Email {
  const greeting = name ? `Hi ${name},` : "Hi,"
  const body = asAdministrator
    ? `${organizationName} invited you to help run it in this app, where it keeps its applications, rules and notices. Sign in with this email address (${to}) to start.`
    : `${organizationName} uses this app for its applications, rules and notices. Sign in with this email address (${to}) to see yours.`
  return {
    to,
    subject: `${organizationName} invited you to sign in`,
    text: `${greeting}\n\n${body}\n\n${signInUrl}`,
    html: `<p>${escaped(greeting)}</p><p>${escaped(body)}</p><p><a href="${escaped(signInUrl)}">Sign in</a></p>`
  }
}
