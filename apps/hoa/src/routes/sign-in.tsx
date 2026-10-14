import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import { authClient } from "@/auth/authClient"
import { safeRedirect, throwIfFailed } from "@/auth/authErrors"
import { SignInPage } from "@/features/account/SignInPage/SignInPage"

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  // Someone already signed in goes on to where they were headed.
  beforeLoad: ({ context, search }) => {
    if (context.session.status !== "signed-out") {
      throw redirect({ href: safeRedirect(search.redirect) })
    }
  },
  head: () => ({ meta: [{ title: "Sign in" }] }),
  component: SignInRoute
})

function SignInRoute() {
  const { redirect } = Route.useSearch()
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const target = safeRedirect(redirect)
  const signedIn = async () => {
    await router.invalidate()
    await router.navigate({ href: target })
  }
  return (
    <SignInPage
      actions={{
        sendCode: async (email) => {
          throwIfFailed(await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }))
        },
        signInWithCode: async (email, code) => {
          throwIfFailed(await authClient.signIn.emailOtp({ email, otp: code }))
          await signedIn()
        },
        signInWithPassword: async (email, password) => {
          throwIfFailed(await authClient.signIn.email({ email, password }))
          await signedIn()
        },
        sendResetCode: async (email) => {
          throwIfFailed(await authClient.emailOtp.requestPasswordReset({ email }))
        },
        resetPassword: async (email, code, password) => {
          throwIfFailed(await authClient.emailOtp.resetPassword({ email, otp: code, password }))
          throwIfFailed(await authClient.signIn.email({ email, password }))
          await signedIn()
        },
        continueWithGoogle:
          session.status === "signed-out" && session.isGoogleConfigured
            ? async () => {
                throwIfFailed(await authClient.signIn.social({ provider: "google", callbackURL: target }))
              }
            : null
      }}
    />
  )
}
