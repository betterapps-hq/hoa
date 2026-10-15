import { env } from "@/env.server"

export type Email = { to: string; subject: string; text: string; html: string }

/**
 * Sends an email through Resend. Without Resend set up, local development prints it to the server log instead, so a
 * sign-in code can be read there; anywhere else that's an error, as nobody would get it.
 */
export async function sendEmail(email: Email) {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html
      })
    })
    if (!response.ok) {
      throw new Error(`Resend didn't send the email (${response.status}).`)
    }
    return
  }
  if (import.meta.env.DEV) {
    console.warn(`[email] To ${email.to}: ${email.subject}\n${email.text}`)
    return
  }
  throw new Error("Email isn't set up: set RESEND_API_KEY and EMAIL_FROM.")
}
