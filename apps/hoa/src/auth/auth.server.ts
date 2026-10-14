import { dash } from "@better-auth/infra"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, captcha, haveIBeenPwned } from "better-auth/plugins"
import { emailOTP } from "better-auth/plugins/email-otp"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { getDb } from "@/db/client.server"
import { accounts, rateLimits, sessions, users, verifications } from "@/db/schema"
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

/** Turnstile's site key for the sign-in page, when the bot check is on; null when it's off. */
export const turnstileSiteKey = () =>
  env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY : null

/** The requests that send an email or try a password: the bot check guards them, and each has a tighter rate limit. */
export const guardedPaths = [
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
  "/sign-in/email"
] as const

/** Requests a visitor may make to each guarded path a minute: enough for a person who mistypes, not for a bot. */
const guardedPerMinute = 5

export const compromisedPasswordMessage = "That password has appeared in a data breach. Choose another."

function safeguards() {
  const turnstileSecret = turnstileSiteKey() ? env.TURNSTILE_SECRET_KEY : undefined
  return [
    // Rejects a new password that's in a known breach, checked by the first five characters of its hash only. It
    // checks requests to Better Auth's endpoints; adding a password from the server checks it there.
    haveIBeenPwned({ customPasswordCompromisedMessage: compromisedPasswordMessage }),
    // The platform's operators (users.role "admin"): sign in as someone to see what they see, ban, end sessions.
    admin(),
    ...(turnstileSecret
      ? [captcha({ provider: "cloudflare-turnstile", secretKey: turnstileSecret, endpoints: [...guardedPaths] })]
      : []),
    // Better Auth Infrastructure's dashboard. It reads and manages the users through this API.
    ...(env.BETTER_AUTH_API_KEY ? [dash({ apiKey: env.BETTER_AUTH_API_KEY })] : [])
  ]
}

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
      schema: { users, sessions, accounts, verifications, rateLimits }
    }),
    // Counted in D1, since a Worker isolate's memory isn't shared, per visitor as Cloudflare reports them.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        ...Object.fromEntries(guardedPaths.map((path) => [path, { window: 60, max: guardedPerMinute }])),
        "/sign-in/email-otp": { window: 60, max: guardedPerMinute },
        // Every page asks for the session; the cookie cache answers most of them.
        "/get-session": false
      }
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
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
      ...safeguards(),
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
