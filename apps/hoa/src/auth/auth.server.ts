import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { emailOTP } from "better-auth/plugins/email-otp"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { getDb } from "@/db/client.server"
import { accounts, sessions, users, verifications } from "@/db/schema"
import { env } from "@/env.server"
import { sendEmail } from "./email.server"
import { codeEmail } from "./emails"

/** How long a code by email lasts. */
export const codeMinutes = 10

/** Signs sessions in local development, where no secret is set. Never used elsewhere. */
const developmentSecret = "local-development-only-secret-never-used-in-production"

function secret() {
  if (env.BETTER_AUTH_SECRET) {
    return env.BETTER_AUTH_SECRET
  }
  if (import.meta.env.DEV) {
    return developmentSecret
  }
  throw new Error("Accounts aren't set up: set BETTER_AUTH_SECRET.")
}

/** Whether "Continue with Google" can work here. */
export const isGoogleConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

function createAuth() {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}
  return betterAuth({
    appName: "HOA",
    secret: secret(),
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      usePlural: true,
      schema: { users, sessions, accounts, verifications }
    }),
    // Accounts start from an email code or Google, which both prove the email; a password is added afterward, from the
    // account page, by those who want one.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    socialProviders: google,
    // A code by email always works, so Google can be disconnected even when it's the only account linked.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"], allowUnlinkingAll: true } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 }
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: codeMinutes * 60,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendEmail(codeEmail(email, otp, type, codeMinutes))
        }
      }),
      // Last, so the cookies the others set reach the response.
      tanstackStartCookies()
    ]
  })
}

let auth: ReturnType<typeof createAuth> | null = null

/** The app's Better Auth, made once per Worker isolate. */
export function getAuth() {
  auth ??= createAuth()
  return auth
}
