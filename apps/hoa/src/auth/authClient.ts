import { adminClient, emailOTPClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * Better Auth in the browser: sign in by code, password or Google, and sign out; and for the platform's operators, view
 * the app as someone.
 */
export const authClient = createAuthClient({ plugins: [emailOTPClient(), adminClient()] })
