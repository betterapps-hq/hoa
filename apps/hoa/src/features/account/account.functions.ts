import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { getAuth, isGoogleConfigured } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { accounts } from "@/db/schema"
import { getSignedInAccount } from "@/session/requestContext.server"

export type AccountDetails = {
  name: string
  email: string
  hasPassword: boolean
  /** The linked Google account's id here, to disconnect it; null when none is linked. */
  googleAccountId: string | null
  isGoogleConfigured: boolean
}

async function requireAccount() {
  const account = await getSignedInAccount()
  if (!account) {
    throw new Error("Sign in first.")
  }
  return account
}

/** The signed-in account: its name and email, and how it can sign in. */
export const getAccountDetails = createServerFn({ method: "GET" }).handler(async (): Promise<AccountDetails> => {
  const account = await requireAccount()
  const methods = await getDb()
    .select({ id: accounts.id, providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, account.id))
  return {
    name: account.name,
    email: account.email,
    hasPassword: methods.some((method) => method.providerId === "credential"),
    googleAccountId: methods.find((method) => method.providerId === "google")?.id ?? null,
    isGoogleConfigured: isGoogleConfigured()
  }
})

/** Adds a password to an account that signs in by code or Google. Changing one goes through Better Auth's client. */
export const addPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters.")
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const account = await requireAccount()
    const existing = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, account.id), eq(accounts.providerId, "credential")))
      .get()
    if (existing) {
      throw new Error("This account has a password already. Change it instead.")
    }
    await getAuth().api.setPassword({ body: { newPassword: data.password }, headers: getRequestHeaders() })
  })
