/** An error as Better Auth's client returns it. */
export type AuthError = { code?: string | undefined; message?: string | undefined; status?: number | undefined }

const messages: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the email, or send a new code.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many tries with that code. Send a new one.",
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Try again, or sign in with a code.",
  INVALID_EMAIL: "Give an email address such as name@example.com.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters.",
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
  INVALID_PASSWORD: "That isn't your current password.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account has no password yet. Sign in with a code instead.",
  USER_NOT_FOUND: "No account has that email. Sign in with a code to start one.",
  SESSION_EXPIRED: "For your security, sign out and sign in again, then try again."
}

/** What went wrong signing in, in words someone can act on. */
export function authErrorMessage(error: AuthError | null | undefined, fallback = "That didn't work. Try again.") {
  if (!error) {
    return fallback
  }
  if (error.status === 429) {
    return "Too many tries. Wait a minute, then try again."
  }
  return (error.code ? messages[error.code] : undefined) ?? fallback
}

/** Throws an Error with `authErrorMessage`'s words when a Better Auth call failed. */
export function throwIfFailed(result: { error: AuthError | null }, fallback?: string) {
  if (result.error) {
    throw new Error(authErrorMessage(result.error, fallback))
  }
}

/** Where to go after signing in: a path in this app, never another site. */
export function safeRedirect(target: string | undefined) {
  return target && target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\") ? target : "/"
}
