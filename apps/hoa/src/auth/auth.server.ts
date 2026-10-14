import { dash } from "@better-auth/infra"
import { getRequestUrl } from "@tanstack/react-start/server"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, captcha, haveIBeenPwned, organization } from "better-auth/plugins"
import { emailOTP } from "better-auth/plugins/email-otp"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { and, eq } from "drizzle-orm"
import { getDb } from "@/db/client.server"
import { invitationDays } from "@/db/membershipRepository"
import {
  accounts,
  invitations,
  members,
  organizations,
  people,
  rateLimits,
  sessions,
  users,
  verifications
} from "@/db/schema"
import { env } from "@/env.server"
import { sendEmail } from "./email.server"
import { codeEmail, invitationEmail } from "./emails"

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
    ...(turnstileSecret
      ? [captcha({ provider: "cloudflare-turnstile", secretKey: turnstileSecret, endpoints: [...guardedPaths] })]
      : []),
    // Better Auth Infrastructure's dashboard. It reads and manages the users through this API.
    ...(env.BETTER_AUTH_API_KEY ? [dash({ apiKey: env.BETTER_AUTH_API_KEY })] : [])
  ]
}

/** Emails an invitation to join an organization, greeting the person on its roll it's for by name. */
export async function emailInvitation({
  email,
  role,
  organization: invitedTo
}: {
  email: string
  role: string | null
  organization: { id: string; name: string }
}) {
  const person = await getDb()
    .select({ name: people.name })
    .from(people)
    .where(and(eq(people.organizationId, invitedTo.id), eq(people.email, email)))
    .get()
  // The request that invited them, when no URL is set: a call from the server doesn't give Better Auth one.
  const origin = env.BETTER_AUTH_URL ?? new URL(getRequestUrl()).origin
  await sendEmail(invitationEmail(email, person?.name ?? "", invitedTo.name, `${origin}/sign-in`, role === "admin"))
}

/**
 * The associations (docs/design/people.md), as Better Auth's organization plugin: the organization, who has an account
 * in it and their role ("admin" or "member"), and invitations. The roll, units and committees are the app's own.
 */
function associations() {
  return organization({
    // Only the platform's operators make one, from Better Auth's dashboard, until associations can sign up.
    allowUserToCreateOrganization: false,
    creatorRole: "admin",
    invitationExpiresIn: invitationDays * 24 * 60 * 60,
    // Inviting again replaces the invitation still waiting, with its role. The app invites through `inviteToJoin`;
    // these cover an invitation sent from Better Auth's dashboard.
    cancelPendingInvitationsOnReInvite: true,
    sendInvitationEmail: emailInvitation
  })
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
      schema: { users, sessions, accounts, verifications, rateLimits, organizations, members, invitations }
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
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // A session and its user in one query, through the schema's relations, instead of one query each.
      database: { joins: true }
    },
    // Accounts start from an email code or Google, which both prove the email; a password is added afterward, from the
    // account page, by those who want one.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    socialProviders: google,
    // A code by email always works, so Google can be disconnected even when it's the only account linked.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"], allowUnlinkingAll: true } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Encrypted, not only signed, so the cookie doesn't show the account's details to whoever holds it.
      cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" }
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
      associations(),
      // The platform's operators (users.role "admin"): view the app as someone, ban, end sessions. Listed on its own so
      // its fields reach the session's types.
      admin(),
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
