import type { Decorator, Preview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import "../src/styles.css"

/** A query client of the story's own, so one story's polling never feeds another. */
const WithQueryClient: Decorator = (Story) => {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <Story />
    </QueryClientProvider>
  )
}

/** The app's light or dark theme, from the toolbar: the dark class goes on the root, as the app puts it. */
const WithTheme: Decorator = (Story, context) => {
  const isDark = context.globals.theme === "dark"
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
  }, [isDark])
  return <Story />
}

const preview: Preview = {
  decorators: [WithTheme, WithQueryClient],
  globalTypes: {
    theme: {
      description: "Light or dark",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true }
    }
  },
  initialGlobals: { theme: "light" },
  parameters: { layout: "padded" }
}

export default preview
