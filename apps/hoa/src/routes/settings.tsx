import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  deleteAssociation,
  getSettings,
  removeLogo,
  saveDetails,
  saveSettings,
  uploadLogo
} from "@/features/settings/settings.functions"
import { SettingsPage } from "@/features/settings/SettingsPage/SettingsPage"

export const Route = createFileRoute("/settings")({
  staticData: { title: "Settings" },
  loader: () => getSettings(),
  component: SettingsRoute
})

function SettingsRoute() {
  const association = Route.useLoaderData()
  const router = useRouter()
  // Each change reloads the page's data, and the shell's, which shows the name and logo.
  const thenReload = async (change: Promise<unknown>) => {
    await change
    await router.invalidate()
  }
  return (
    <SettingsPage
      association={association}
      actions={{
        saveDetails: (details) => thenReload(saveDetails({ data: details })),
        saveSettings: (settings) => thenReload(saveSettings({ data: settings })),
        uploadLogo: (file) => {
          const form = new FormData()
          form.append("file", file)
          return thenReload(uploadLogo({ data: form }))
        },
        removeLogo: () => thenReload(removeLogo()),
        deleteAssociation: async (name) => {
          await deleteAssociation({ data: { name } })
          // A full load, so the app opens wherever the account still belongs.
          window.location.assign("/")
        }
      }}
    />
  )
}
