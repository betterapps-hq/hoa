import { createFileRoute, useRouter } from "@tanstack/react-router"
import { authClient } from "@/auth/authClient"
import { throwIfFailed } from "@/auth/authErrors"
import { addPassword, getAccountDetails } from "@/features/account/account.functions"
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
  const page = (
    <AccountPage
      account={account}
      actions={{
        rename: async (name) => {
          throwIfFailed(await authClient.updateUser({ name }))
          await router.invalidate()
        },
        addPassword: async (password) => {
          await addPassword({ data: { password } })
          await router.invalidate()
        },
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
        signOutElsewhere: async () => {
          throwIfFailed(await authClient.revokeOtherSessions())
        }
      }}
    />
  )
  // Without an association there's no app shell around the page.
  return session.status === "member" ? page : <div className="mx-auto max-w-2xl py-10">{page}</div>
}
