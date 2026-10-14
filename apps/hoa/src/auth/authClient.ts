import { emailOTPClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/** Better Auth in the browser: sign in by code, password or Google, and sign out. */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] })
