import type { Decorator, Preview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
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

const preview: Preview = {
  decorators: [WithQueryClient],
  parameters: { layout: "padded" }
}

export default preview
