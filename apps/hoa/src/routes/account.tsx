import { createFileRoute, useRouter } from "@tanstack/react-router"
import { authClient } from "@/auth/authClient"
import { throwIfFailed } from "@/auth/authErrors"
import {
  addPassword,
  claimHome,
  resignSeat,
  getAccountDetails,
  saveMyDetails,
  signOutDevice
} from "@/features/account/account.functions"
import { AccountPage } from "@/features/account/AccountPage/AccountPage"

export const Route = createFileRoute("/account")({
  staticData: { title: "Account" },
  loader: () => getAccountDetails(),
  component: AccountRoute
})

function AccountRoute() {
  const account = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  const router = useRouter()
  // Each change reloads the page's data, and the shell's, which shows the name.
  const thenReload = async (change: Promise<unknown>) => {
    await change
    await router.invalidate()
  }
  const page = (
    <AccountPage
      account={account}
      actions={{
        saveDetails: (details) => thenReload(saveMyDetails({ data: details })),
        addPassword: (password) => thenReload(addPassword({ data: { password } })),
        changePassword: async (current, next) => {
          throwIfFailed(await authClient.changePassword({ currentPassword: current, newPassword: next }))
        },
        connectGoogle: async () => {
          throwIfFailed(await authClient.linkSocial({ provider: "google", callbackURL: "/account" }))
        },
        disconnectGoogle: async (accountId) => {
          throwIfFailed(await authClient.unlinkAccount({ accountId }))
          await router.invalidate()
        },
        signOutDevice: (id) => thenReload(signOutDevice({ data: { id } })),
        signOutElsewhere: async () => {
          throwIfFailed(await authClient.revokeOtherSessions())
          await router.invalidate()
        },
        claimHome: (unitId) => thenReload(claimHome({ data: { unitId } })),
        resign: (id, endedOn) => thenReload(resignSeat({ data: { id, endedOn } })),
        signInAgain: async () => {
          throwIfFailed(await authClient.signOut())
          await router.navigate({ to: "/sign-in", search: { redirect: "/account" } })
        },
        deleteAccount: async () => {
          const result = await authClient.deleteUser()
          throwIfFailed(result, result.error?.message)
          // A full load, so nothing of the account stays on the page.
          window.location.assign("/sign-in")
        }
      }}
    />
  )
  // Without an association there's no app shell around the page.
  return session.status === "member" ? page : <div className="min-h-svh bg-background">{page}</div>
}
